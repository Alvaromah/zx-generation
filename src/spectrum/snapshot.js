/**
 * ZX Spectrum .z80 Snapshot Loader (version 1)
 * This loader only supports the original 48K snapshot format.
 */

export class Z80SnapshotLoader {
    constructor(memory, cpu, ula) {
        this.memory = memory;
        this.cpu = cpu;
        this.ula = ula;
    }

    /**
     * Load a snapshot from a Uint8Array
     * @param {Uint8Array} data snapshot data
     */
    load(data) {
        if (!(data instanceof Uint8Array)) {
            throw new Error('Snapshot data must be Uint8Array');
        }
        if (data.length < 30) {
            throw new Error('Snapshot too small');
        }

        // Header fields
        const header = data.subarray(0, 30);
        const regs = this.cpu.registers;
        regs.set('A', header[0]);
        regs.set('F', header[1]);
        regs.set('C', header[2]);
        regs.set('B', header[3]);
        regs.set('L', header[4]);
        regs.set('H', header[5]);
        regs.set16('PC', header[6] | (header[7] << 8));
        regs.set16('SP', header[8] | (header[9] << 8));
        regs.data.I = header[10];
        regs.data.R = header[11];

        const flags1 = header[12];
        const compressed = (flags1 & 0x20) !== 0;
        const border = flags1 & 0x07;

        regs.set('E', header[13]);
        regs.set('D', header[14]);
        regs.data.C_ = header[15];
        regs.data.B_ = header[16];
        regs.data.E_ = header[17];
        regs.data.D_ = header[18];
        regs.data.L_ = header[19];
        regs.data.H_ = header[20];
        regs.data.A_ = header[21];
        regs.data.F_ = header[22];
        regs.set16('IY', header[23] | (header[24] << 8));
        regs.set16('IX', header[25] | (header[26] << 8));
        this.cpu.iff1 = header[27] !== 0;
        this.cpu.iff2 = header[28] !== 0;
        this.cpu.interruptMode = header[29];

        if (this.ula && typeof this.ula.setBorderColor === 'function') {
            this.ula.setBorderColor(border);
        }

        const memData = compressed ?
            this._decompress(data.subarray(30)) :
            data.subarray(30, 30 + 49152);

        for (let i = 0; i < memData.length && i < 49152; i++) {
            this.memory.write(0x4000 + i, memData[i]);
        }
    }

    _decompress(data) {
        const result = new Uint8Array(49152);
        let ptr = 0;
        let i = 0;
        while (i < data.length && ptr < result.length) {
            const b = data[i++];
            if (b === 0xED && i < data.length && data[i] === 0xED) {
                if (i + 2 >= data.length) {break;}
                const count = data[i + 1];
                const value = data[i + 2];
                if (count !== 0) {
                    i += 3;
                    result.fill(value, ptr, ptr + count);
                    ptr += count;
                    continue;
                }
            }
            result[ptr++] = b;
        }
        return result;
    }
}