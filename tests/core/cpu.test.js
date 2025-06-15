import { Z80 } from '../../src/core/cpu.js';
import { Registers } from '../../src/core/registers.js';

describe('Z80 CPU', () => {
  let cpu;
  let mockMemory;
  let mockULA;

  beforeEach(() => {
    mockMemory = {
      read: jest.fn(),
      write: jest.fn(),
      readWord: jest.fn(),
      writeWord: jest.fn(),
    };
    mockULA = {
      read: jest.fn(),
      write: jest.fn(),
    };
    cpu = new Z80(mockMemory, mockULA);
  });

  describe('initialization', () => {
    it('should initialize with correct default values', () => {
      expect(cpu.registers).toBeInstanceOf(Registers);
      expect(cpu.halted).toBe(false);
      expect(cpu.iff1).toBe(true);
      expect(cpu.iff2).toBe(true);
      expect(cpu.interruptMode).toBe(1);
      expect(cpu.cycles).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset CPU state', () => {
      cpu.halted = true;
      cpu.iff1 = true;
      cpu.iff2 = true;
      cpu.cycles = 1000;
      cpu.registers.setPC(0x1234);

      cpu.reset();

      expect(cpu.halted).toBe(false);
      expect(cpu.iff1).toBe(true);
      expect(cpu.iff2).toBe(true);
      expect(cpu.cycles).toBe(0);
      expect(cpu.registers.getPC()).toBe(0);
    });
  });

  describe('memory operations', () => {
    it('should fetch byte from memory at PC', () => {
      cpu.registers.setPC(0x1000);
      mockMemory.read.mockReturnValue(0x42);

      const result = cpu.memory.fetchByte(cpu.registers);

      expect(mockMemory.read).toHaveBeenCalledWith(0x1000);
      expect(result).toBe(0x42);
      expect(cpu.registers.getPC()).toBe(0x1001);
    });

    it('should fetch word from memory in little-endian format', () => {
      cpu.registers.setPC(0x1000);
      mockMemory.read.mockReturnValueOnce(0x34); // Low byte
      mockMemory.read.mockReturnValueOnce(0x12); // High byte

      const result = cpu.memory.fetchWord(cpu.registers);

      expect(mockMemory.read).toHaveBeenCalledWith(0x1000);
      expect(mockMemory.read).toHaveBeenCalledWith(0x1001);
      expect(result).toBe(0x1234);
      expect(cpu.registers.getPC()).toBe(0x1002);
    });

    it('should push word to stack', () => {
      cpu.registers.set16('SP', 0x8000);

      cpu.memory.pushWord(cpu.registers, 0x1234);

      expect(mockMemory.write).toHaveBeenCalledWith(0x7FFF, 0x12); // High byte
      expect(mockMemory.write).toHaveBeenCalledWith(0x7FFE, 0x34); // Low byte
      expect(cpu.registers.get16('SP')).toBe(0x7FFE);
    });

    it('should pop word from stack', () => {
      cpu.registers.set16('SP', 0x7FFE);
      mockMemory.read.mockReturnValueOnce(0x34); // Low byte
      mockMemory.read.mockReturnValueOnce(0x12); // High byte

      const result = cpu.memory.popWord(cpu.registers);

      expect(mockMemory.read).toHaveBeenCalledWith(0x7FFE);
      expect(mockMemory.read).toHaveBeenCalledWith(0x7FFF);
      expect(result).toBe(0x1234);
      expect(cpu.registers.get16('SP')).toBe(0x8000);
    });
  });

  describe('interrupts', () => {
    it('should handle maskable interrupt when enabled', () => {
      cpu.iff1 = true;
      cpu.iff2 = true;
      cpu.registers.setPC(0x1234);
      cpu.registers.set16('SP', 0x8000);

      cpu.interrupt();

      expect(cpu.iff1).toBe(false);
      expect(cpu.iff2).toBe(false);
    });

    it('should not handle interrupt when disabled', () => {
      cpu.iff1 = false;
      cpu.iff2 = false;
      const pc = cpu.registers.getPC();

      cpu.interrupt();

      expect(cpu.registers.getPC()).toBe(pc); // PC unchanged
    });

    it('should handle interrupt mode 1', () => {
      cpu.iff1 = true;
      cpu.interruptMode = 1;
      cpu.registers.setPC(0x1234);
      cpu.registers.set16('SP', 0x8000);

      cpu.interrupt();

      expect(cpu.registers.getPC()).toBe(0x0038); // IM1 interrupt vector
      expect(mockMemory.write).toHaveBeenCalledWith(0x7FFF, 0x12); // High byte of return address
      expect(mockMemory.write).toHaveBeenCalledWith(0x7FFE, 0x34); // Low byte of return address
    });
  });

  describe('execute', () => {
    it('should not execute when halted', () => {
      cpu.halted = true;
      const initialCycles = cpu.cycles;
      mockMemory.read.mockReturnValue(0x00); // NOP

      cpu.execute();

      // When halted, CPU should only count cycles
      expect(cpu.cycles).toBeGreaterThan(initialCycles);
    });

    it('should execute NOP instruction', () => {
      mockMemory.read.mockReturnValue(0x00); // NOP
      const initialCycles = cpu.cycles;
      const initialPC = cpu.registers.getPC();

      cpu.execute();

      expect(cpu.cycles).toBe(initialCycles + 4); // NOP takes 4 cycles
      expect(cpu.registers.getPC()).toBe(initialPC + 1);
    });

    it('should execute HALT instruction', () => {
      mockMemory.read.mockReturnValue(0x76); // HALT

      cpu.execute();

      expect(cpu.halted).toBe(true);
    });
  });

  describe('flags', () => {
    it('should get and set flags correctly', () => {
      const masks = cpu.flagMasks;
      
      cpu.setFlag(masks.Z, true);
      expect(cpu.getFlag(masks.Z)).toBe(true);

      cpu.setFlag(masks.Z, false);
      expect(cpu.getFlag(masks.Z)).toBe(false);

      cpu.setFlag(masks.C, true);
      expect(cpu.getFlag(masks.C)).toBe(true);
    });
  });

  describe('state management', () => {
    it('should get and set CPU state', () => {
      cpu.registers.setPC(0x1234);
      cpu.registers.set16('SP', 0x8000);
      cpu.registers.set('A', 0x42);
      cpu.halted = true;
      cpu.cycles = 1000;

      const state = cpu.getState();

      // The second getState returns a flat structure
      expect(state.pc).toBe(0x1234);
      expect(state.sp).toBe(0x8000);
      expect(state.a).toBe(0x42);
      expect(state.halted).toBe(true);
      expect(state.cycles).toBe(1000);
    });
  });

  describe('legacy register methods', () => {
    it('should support legacy getBC/setBC methods', () => {
      cpu.setBC(0x1234);
      expect(cpu.getBC()).toBe(0x1234);
    });

    it('should support legacy getDE/setDE methods', () => {
      cpu.setDE(0x5678);
      expect(cpu.getDE()).toBe(0x5678);
    });

    it('should support legacy getHL/setHL methods', () => {
      cpu.setHL(0x9ABC);
      expect(cpu.getHL()).toBe(0x9ABC);
    });

    it('should support legacy getAF/setAF methods', () => {
      cpu.setAF(0xDEF0);
      expect(cpu.getAF()).toBe(0xDEF0);
    });
  });
});