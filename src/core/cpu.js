import { Registers } from './registers.js';
import { Flags } from './flags.js';
import { MemoryInterface } from '../interfaces/memory-interface.js';
import { IOInterface } from '../interfaces/io-interface.js';
import { ArithmeticInstructions } from '../instructions/arithmetic.js';
import { LogicalInstructions } from '../instructions/logical.js';
import { LoadInstructions } from '../instructions/load.js';
import { JumpInstructions } from '../instructions/jump.js';
import { BitInstructions } from '../instructions/bit.js';
import { MiscInstructions } from '../instructions/misc.js';
import { ExtendedInstructions } from '../instructions/extended.js';
import { IndexedInstructions } from '../instructions/indexed.js';
import { InstructionDecoder } from '../decoder/instruction-decoder.js';

/**
 * Z80 CPU Emulator
 * Complete and accurate Z80 processor emulation with full instruction set support
 * 
 * @class Z80
 */
class Z80 {
    /**
     * Create a Z80 CPU instance
     * 
     * @constructor
     * @param {Object} memory - Memory interface for RAM/ROM access
     * @param {Object} ula - ULA interface for I/O operations
     */
    constructor(memory, ula) {
        // Initialize interfaces
        this.memory = new MemoryInterface(memory);
        this.io = new IOInterface(ula);

        // Initialize core components
        this.registers = new Registers();
        this.flags = new Flags();

        // Initialize instruction handlers
        this.instructions = {
            arithmetic: new ArithmeticInstructions(this.registers, this.flags, this.memory),
            logical: new LogicalInstructions(this.registers, this.flags),
            load: new LoadInstructions(this.registers, this.memory, this.io, this.flags, this),
            jump: new JumpInstructions(this.registers, this.flags, this.memory),
            bit: new BitInstructions(this.registers, this.flags, this.memory),
            misc: new MiscInstructions(this.registers, this.memory),
            extended: new ExtendedInstructions(this.registers, this.flags, this.memory, this.io),
        };

        // Initialize indexed instructions with factory pattern to avoid circular dependencies
        const instructionFactories = {
            getArithmetic: () => this.instructions.arithmetic,
            getLogical: () => this.instructions.logical,
            getLoad: () => this.instructions.load,
            getBit: () => this.instructions.bit,
        };

        this.instructions.indexed = new IndexedInstructions(
            this.registers,
            this.flags,
            this.memory,
            instructionFactories
        );

        // Initialize instruction decoder
        this.decoder = new InstructionDecoder(
            this.registers,
            this.flags,
            this.memory,
            this.io,
            this.instructions
        );

        // CPU state
        this.reset();
    }

    /**
     * Reset the CPU to initial state
     * 
     * @returns {void}
     */
    reset() {
        this.registers.reset();
        this.halted = false;
        this.interruptMode = 1;
        this.cycles = 0;
        this.iff1 = true; // Interrupt flip-flop 1
        this.iff2 = true; // Interrupt flip-flop 2
        this.instructionCount = 0; // For debugging
    }

    /**
     * Execute a single instruction
     * 
     * @returns {void}
     */
    execute() {
        if (this.halted) {
            // HALT instruction continues to consume 4 T-states per M1 cycle
            // until an interrupt occurs. This is important for accurate timing.
            this.cycles += 4;
            this.registers.incrementR();
            return 4;
        }

        // Log first few instructions for debugging
        // if (this.instructionCount < 10) {
        //     const pc = this.registers.getPC();
        //     const opcode = this.memory.readByte ? this.memory.readByte(pc) : this.memory.read(pc);
        //     console.log(`Instruction ${this.instructionCount}: PC=0x${pc.toString(16).padStart(4, '0')}, opcode=0x${opcode.toString(16).padStart(2, '0')}`);
        //     this.instructionCount++;
        // }

        const opcode = this.memory.fetchByte(this.registers);
        this.registers.incrementR();

        const instructionCycles = this.decoder.execute(opcode, this);
        this.cycles += instructionCycles;
        return instructionCycles;
    }

    /**
     * Trigger a maskable interrupt
     * 
     * @returns {void}
     */
    interrupt() {
        if (this.iff1 || this.halted) {
            this.halted = false;
            this.iff1 = false;
            this.iff2 = false;

            // Handle different interrupt modes
            switch (this.interruptMode) {
                case 0: // Mode 0 - Execute instruction on data bus
                    // On most systems, data bus contains 0xFF (RST 38H)
                    this.memory.pushWord(this.registers, this.registers.getPC());
                    this.registers.setPC(0x0038);
                    this.cycles += 13;
                    break;

                case 1: // Mode 1 - RST 38h always
                    this.memory.pushWord(this.registers, this.registers.getPC());
                    this.registers.setPC(0x0038);
                    this.cycles += 13;
                    break;

                case 2: // Mode 2 - Vectored interrupt
                    {
                        // Vector formed from I register (high byte) and data bus (low byte)
                        const vector = (this.registers.get('I') << 8) | 0xff; // Assuming 0xFF on data bus
                        const addr = this.memory.readWord(vector);
                        this.memory.pushWord(this.registers, this.registers.getPC());
                        this.registers.setPC(addr);
                        this.cycles += 19;
                    }
                    break;
            }
        }
    }

    /**
     * Get complete CPU state with nested structure (DEPRECATED)
     * @deprecated Use getState() instead - this method will be removed in future versions
     * @returns {Object} CPU state with nested structure
     */
    getStateNested() {
        return {
            registers: this.registers.dump(),
            flags: {
                S: this.flags.getFlag(this.registers.get('F'), this.flags.masks.S),
                Z: this.flags.getFlag(this.registers.get('F'), this.flags.masks.Z),
                H: this.flags.getFlag(this.registers.get('F'), this.flags.masks.H),
                PV: this.flags.getFlag(this.registers.get('F'), this.flags.masks.PV),
                N: this.flags.getFlag(this.registers.get('F'), this.flags.masks.N),
                C: this.flags.getFlag(this.registers.get('F'), this.flags.masks.C),
            },
            cpu: {
                halted: this.halted,
                interruptMode: this.interruptMode,
                cycles: this.cycles,
                iff1: this.iff1,
                iff2: this.iff2,
            },
        };
    }

    /**
     * Set CPU state from nested structure (DEPRECATED)
     * @deprecated Use setState() instead - this method will be removed in future versions
     * @param {Object} state - CPU state with nested structure
     */
    setStateNested(state) {
        if (state.registers) {
            Object.keys(state.registers).forEach(reg => {
                if (reg.length === 1) {
                    this.registers.set(reg, parseInt(state.registers[reg], 16));
                } else {
                    this.registers.set16(reg, parseInt(state.registers[reg], 16));
                }
            });
        }

        if (state.cpu) {
            this.halted = state.cpu.halted || false;
            this.interruptMode = state.cpu.interruptMode || 1;
            this.cycles = state.cpu.cycles || 0;
            this.iff1 = state.cpu.iff1 || false;
            this.iff2 = state.cpu.iff2 || false;
        }
    }

    // Legacy compatibility methods
    getBC() {
        return this.registers.getBC();
    }
    getDE() {
        return this.registers.getDE();
    }
    getHL() {
        return this.registers.getHL();
    }
    getAF() {
        return this.registers.getAF();
    }
    setBC(value) {
        this.registers.setBC(value);
    }
    setDE(value) {
        this.registers.setDE(value);
    }
    setHL(value) {
        this.registers.setHL(value);
    }
    setAF(value) {
        this.registers.setAF(value);
    }

    getFlag(flag) {
        return this.flags.getFlag(this.registers.get('F'), flag);
    }

    setFlag(flag, value) {
        const newF = this.flags.setFlag(this.registers.get('F'), flag, value);
        this.registers.set('F', newF);
    }

    get flagMasks() {
        return this.flags.masks;
    }
    
    /**
     * Get complete CPU state in flat structure
     * Used for snapshots and state management
     * 
     * @returns {Object} CPU state with all registers and flags
     * @returns {number} .pc - Program counter
     * @returns {number} .sp - Stack pointer
     * @returns {number} .a - Accumulator
     * @returns {number} .f - Flags register
     * @returns {number} .b - B register
     * @returns {number} .c - C register
     * @returns {number} .d - D register
     * @returns {number} .e - E register
     * @returns {number} .h - H register
     * @returns {number} .l - L register
     * @returns {number} .ix - IX index register
     * @returns {number} .iy - IY index register
     * @returns {number} .i - Interrupt vector register
     * @returns {number} .r - Memory refresh register
     * @returns {number} .im - Interrupt mode
     * @returns {boolean} .iff1 - Interrupt flip-flop 1
     * @returns {boolean} .iff2 - Interrupt flip-flop 2
     * @returns {boolean} .halted - HALT state
     * @returns {number} .cycles - Total cycles executed
     * 
     * @example
     * const state = cpu.getState();
     * console.log(`PC: ${state.pc.toString(16)}`);
     * console.log(`SP: ${state.sp.toString(16)}`);
     */
    getState() {
        return {
            // 16-bit registers need special handling
            pc: this.registers.getPC(),
            sp: this.registers.get16('SP'),
            
            // 8-bit registers
            a: this.registers.get('A'),
            f: this.registers.get('F'),
            b: this.registers.get('B'),
            c: this.registers.get('C'),
            d: this.registers.get('D'),
            e: this.registers.get('E'),
            h: this.registers.get('H'),
            l: this.registers.get('L'),
            
            // 16-bit index registers
            ix: this.registers.get16('IX'),
            iy: this.registers.get16('IY'),
            
            // Special registers
            i: this.registers.get('I'),
            r: this.registers.get('R'),
            
            // CPU state
            im: this.interruptMode,  // Fixed: was this.im
            iff1: this.iff1,
            iff2: this.iff2,
            halted: this.halted,      // Added missing property
            cycles: this.cycles
        };
    }
    
    /**
     * Set CPU state from flat structure
     * 
     * @param {Object} state - CPU state to restore
     * @param {number} [state.pc] - Program counter
     * @param {number} [state.sp] - Stack pointer
     * @param {number} [state.a] - Accumulator
     * @param {number} [state.f] - Flags register
     * @param {number} [state.b] - B register
     * @param {number} [state.c] - C register
     * @param {number} [state.d] - D register
     * @param {number} [state.e] - E register
     * @param {number} [state.h] - H register
     * @param {number} [state.l] - L register
     * @param {number} [state.ix] - IX index register
     * @param {number} [state.iy] - IY index register
     * @param {number} [state.i] - Interrupt vector register
     * @param {number} [state.r] - Memory refresh register
     * @param {number} [state.im] - Interrupt mode
     * @param {boolean} [state.iff1] - Interrupt flip-flop 1
     * @param {boolean} [state.iff2] - Interrupt flip-flop 2
     * @param {boolean} [state.halted] - HALT state
     * @param {number} [state.cycles] - Total cycles executed
     * @returns {void}
     * 
     * @example
     * cpu.setState({
     *     pc: 0x8000,
     *     sp: 0xFFFF,
     *     a: 0x00
     * });
     */
    setState(state) {
        // 16-bit registers
        if (state.pc !== undefined) this.registers.setPC(state.pc);
        if (state.sp !== undefined) this.registers.set16('SP', state.sp);
        
        // 8-bit registers
        if (state.a !== undefined) this.registers.set('A', state.a);
        if (state.f !== undefined) this.registers.set('F', state.f);
        if (state.b !== undefined) this.registers.set('B', state.b);
        if (state.c !== undefined) this.registers.set('C', state.c);
        if (state.d !== undefined) this.registers.set('D', state.d);
        if (state.e !== undefined) this.registers.set('E', state.e);
        if (state.h !== undefined) this.registers.set('H', state.h);
        if (state.l !== undefined) this.registers.set('L', state.l);
        
        // 16-bit index registers
        if (state.ix !== undefined) this.registers.set16('IX', state.ix);
        if (state.iy !== undefined) this.registers.set16('IY', state.iy);
        
        // Special registers
        if (state.i !== undefined) this.registers.set('I', state.i);
        if (state.r !== undefined) this.registers.set('R', state.r);
        
        // CPU state
        if (state.im !== undefined) this.interruptMode = state.im;
        if (state.iff1 !== undefined) this.iff1 = state.iff1;
        if (state.iff2 !== undefined) this.iff2 = state.iff2;
        if (state.halted !== undefined) this.halted = state.halted;
        if (state.cycles !== undefined) this.cycles = state.cycles;
    }
}

export { Z80 };
