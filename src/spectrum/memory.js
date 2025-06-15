/**
 * ZX Spectrum Memory Implementation
 * 
 * Memory Map:
 * 0x0000 - 0x3FFF: ROM (16KB)
 * 0x4000 - 0x57FF: Screen memory (6KB)
 * 0x5800 - 0x5AFF: Screen attributes (768 bytes)
 * 0x5B00 - 0x5BFF: Printer buffer
 * 0x5C00 - 0x5CBF: System variables
 * 0x5CC0 - 0x5CFF: Reserved
 * 0x5D00 - 0xFFFF: RAM
 */

/**
 * @class SpectrumMemory
 * @description Implements the ZX Spectrum 48K memory model with 16KB ROM and 48KB RAM.
 * Handles memory-mapped screen display and attributes.
 * 
 * @example
 * const memory = new SpectrumMemory();
 * memory.loadROM(romData);
 * memory.write(0x4000, 0xFF); // Write to screen memory
 * const value = memory.read(0x4000); // Read from screen memory
 */
export class SpectrumMemory {
    /**
     * Creates a new SpectrumMemory instance
     * 
     * @constructor
     */
    constructor() {
        /**
         * @property {Uint8Array} rom - 16KB ROM storage (0x0000-0x3FFF)
         * @private
         */
        this.rom = new Uint8Array(16384);     // 16KB ROM
        
        /**
         * @property {Uint8Array} ram - 48KB RAM storage (0x4000-0xFFFF mapped)
         * @private
         */
        this.ram = new Uint8Array(49152);     // 48KB RAM
        
        /**
         * @property {boolean} romEnabled - Whether ROM is mapped to lower 16KB
         * @private
         */
        this.romEnabled = true;
    }

    /**
     * Read a byte from memory
     * 
     * @param {number} address - Memory address (0x0000-0xFFFF)
     * @returns {number} Byte value (0-255)
     * 
     * @example
     * const screenByte = memory.read(0x4000); // Read first screen byte
     * const romByte = memory.read(0x0000);    // Read first ROM byte
     */
    read(address) {
        address &= 0xFFFF;
        
        if (address < 0x4000 && this.romEnabled) {
            return this.rom[address];
        } else if (address >= 0x4000) {
            return this.ram[address - 0x4000];
        }
        return 0xFF;
    }

    /**
     * Write a byte to memory
     * ROM area (0x0000-0x3FFF) is read-only and writes are ignored
     * 
     * @param {number} address - Memory address (0x0000-0xFFFF)
     * @param {number} value - Byte value to write (0-255)
     * @returns {void}
     * 
     * @example
     * memory.write(0x4000, 0xFF); // Write to screen memory
     * memory.write(0x5800, 0x47); // Write white on black attribute
     */
    write(address, value) {
        address &= 0xFFFF;
        value &= 0xFF;
        
        // ROM area is read-only
        if (address >= 0x4000) {
            this.ram[address - 0x4000] = value;
        }
    }

    /**
     * Load ROM data into memory
     * 
     * @param {Uint8Array} data - ROM data to load
     * @throws {Error} If ROM data exceeds 16384 bytes
     * @returns {void}
     * 
     * @example
     * const response = await fetch('48k.rom');
     * const romData = new Uint8Array(await response.arrayBuffer());
     * memory.loadROM(romData);
     */
    loadROM(data) {
        if (data.length > this.rom.length) {
            throw new Error(`ROM too large: ${data.length} bytes (max ${this.rom.length})`);
        }
        this.rom.set(data);
    }

    /**
     * Get screen pixel memory for rendering
     * Returns a view of the 6KB screen memory area (0x4000-0x57FF)
     * 
     * @returns {Uint8Array} View of screen pixel memory (6144 bytes)
     * 
     * @example
     * const screenMem = memory.getScreenMemory();
     * // Each byte contains 8 pixels (1 bit per pixel)
     */
    getScreenMemory() {
        return this.ram.subarray(0, 0x1800); // 6KB of screen pixels
    }

    /**
     * Get screen attribute memory for rendering
     * Returns a view of the 768-byte attribute area (0x5800-0x5AFF)
     * 
     * Each attribute byte controls an 8x8 pixel cell:
     * - Bits 0-2: INK color (0-7)
     * - Bits 3-5: PAPER color (0-7)
     * - Bit 6: BRIGHT flag
     * - Bit 7: FLASH flag
     * 
     * @returns {Uint8Array} View of attribute memory (768 bytes)
     * 
     * @example
     * const attrs = memory.getAttributeMemory();
     * attrs[0] = 0x47; // White ink on black paper
     * attrs[0] = 0xC7; // Bright white ink on black paper with flash
     */
    getAttributeMemory() {
        return this.ram.subarray(0x1800, 0x1B00); // 768 bytes of attributes
    }

    /**
     * Clear all RAM to zero
     * Typically called during system reset
     * 
     * @returns {void}
     * 
     * @example
     * memory.clearRAM(); // Clear all 48KB of RAM
     */
    clearRAM() {
        this.ram.fill(0);
    }
}