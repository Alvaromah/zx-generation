/**
 * ZX Spectrum Display Renderer
 * Converts screen memory to pixels
 */
/* global ImageData */

/**
 * @class SpectrumDisplay
 * @description Handles rendering of the ZX Spectrum display including the main screen area
 * (256x192 pixels) and border. Implements authentic attribute handling with BRIGHT and FLASH.
 * 
 * The display uses the original ZX Spectrum color palette and handles the complex
 * screen memory layout where pixels are stored in a non-linear format.
 * 
 * @example
 * const display = new SpectrumDisplay();
 * const imageData = display.render(screenMem, attrMem, borderColor);
 * ctx.putImageData(imageData, 0, 0);
 */
export class SpectrumDisplay {
    /**
     * Creates a new SpectrumDisplay instance
     * 
     * @constructor
     */
    constructor() {
        /**
         * @property {number} width - Screen width in pixels (excluding border)
         * @readonly
         */
        this.width = 256;
        
        /**
         * @property {number} height - Screen height in pixels (excluding border)
         * @readonly
         */
        this.height = 192;
        
        /**
         * @property {number} borderTop - Top border size in pixels
         * @readonly
         */
        this.borderTop = 48;
        
        /**
         * @property {number} borderBottom - Bottom border size in pixels
         * @readonly
         */
        this.borderBottom = 56;
        
        /**
         * @property {number} borderLeft - Left border size in pixels
         * @readonly
         */
        this.borderLeft = 48;
        
        /**
         * @property {number} borderRight - Right border size in pixels
         * @readonly
         */
        this.borderRight = 48;
        
        /**
         * @property {number} totalWidth - Total display width including border
         * @readonly
         */
        this.totalWidth = this.width + this.borderLeft + this.borderRight;
        
        /**
         * @property {number} totalHeight - Total display height including border
         * @readonly
         */
        this.totalHeight = this.height + this.borderTop + this.borderBottom;
        
        /**
         * @property {Uint8Array} displayBuffer - RGBA pixel buffer for the entire display
         * @private
         */
        this.displayBuffer = new Uint8Array(this.totalWidth * this.totalHeight * 4);
        
        /**
         * @property {boolean} flashPhase - Current flash state (true = swapped colors)
         * @private
         */
        this.flashPhase = false;
        
        /**
         * @property {number} flashCounter - Frame counter for flash timing
         * @private
         */
        this.flashCounter = 0;
        
        /**
         * @property {number} FLASH_FRAMES - Frames between flash toggles
         * @private
         */
        this.FLASH_FRAMES = 32; // Flash every 32 frames (about 0.64 seconds at 50Hz)
        
        // Pre-compute attribute cache for performance
        this.initAttributeCache();
        
        /**
         * @property {Array<Array<number>>} palette - ZX Spectrum color palette in RGBA format
         * @private
         */
        this.palette = [
            [0x00, 0x00, 0x00, 0xFF], // 0: Black
            [0x00, 0x00, 0xD7, 0xFF], // 1: Blue
            [0xD7, 0x00, 0x00, 0xFF], // 2: Red
            [0xD7, 0x00, 0xD7, 0xFF], // 3: Magenta
            [0x00, 0xD7, 0x00, 0xFF], // 4: Green
            [0x00, 0xD7, 0xD7, 0xFF], // 5: Cyan
            [0xD7, 0xD7, 0x00, 0xFF], // 6: Yellow
            [0xD7, 0xD7, 0xD7, 0xFF], // 7: White
            // Bright colors
            [0x00, 0x00, 0x00, 0xFF], // 8: Black (bright)
            [0x00, 0x00, 0xFF, 0xFF], // 9: Blue (bright)
            [0xFF, 0x00, 0x00, 0xFF], // 10: Red (bright)
            [0xFF, 0x00, 0xFF, 0xFF], // 11: Magenta (bright)
            [0x00, 0xFF, 0x00, 0xFF], // 12: Green (bright)
            [0x00, 0xFF, 0xFF, 0xFF], // 13: Cyan (bright)
            [0xFF, 0xFF, 0x00, 0xFF], // 14: Yellow (bright)
            [0xFF, 0xFF, 0xFF, 0xFF]  // 15: White (bright)
        ];
    }
    
    /**
     * Initialize attribute cache for fast rendering
     * Pre-computes color values for all possible attribute combinations
     * 
     * @private
     * @returns {void}
     */
    initAttributeCache() {
        this.attributeCache = new Array(256);
        
        for (let attr = 0; attr < 256; attr++) {
            const ink = attr & 0x07;
            const paper = (attr >> 3) & 0x07;
            const bright = (attr >> 6) & 0x01;
            const flash = (attr >> 7) & 0x01;
            
            this.attributeCache[attr] = {
                ink: ink + (bright ? 8 : 0),
                paper: paper + (bright ? 8 : 0),
                flash: flash !== 0
            };
        }
    }

    /**
     * Render the display from screen and attribute memory
     * 
     * @param {Uint8Array} screenMemory - 6KB of screen pixel data
     * @param {Uint8Array} attributeMemory - 768 bytes of attribute data
     * @param {number} borderColor - Border color index (0-7)
     * @param {Uint8Array} [scanlineBorderColors=null] - Per-scanline border colors for effects
     * @returns {Uint8Array} RGBA pixel data for the entire display
     * 
     * @example
     * const pixels = display.render(screenMem, attrMem, 1); // Blue border
     */
    render(screenMemory, attributeMemory, borderColor, scanlineBorderColors = null) {
        // Update flash phase
        this.flashCounter++;
        if (this.flashCounter >= this.FLASH_FRAMES) {
            this.flashPhase = !this.flashPhase;
            this.flashCounter = 0;
        }
        
        // Fill border - use scanline colors if available for stripe effects
        if (scanlineBorderColors) {
            this.fillBorderWithScanlines(scanlineBorderColors);
        } else {
            this.fillBorder(borderColor);
        }
        
        // Then render the screen content
        for (let y = 0; y < 192; y++) {
            for (let x = 0; x < 32; x++) { // 32 bytes per line (256 pixels / 8)
                // Calculate screen memory address
                // ZX Spectrum has a complex screen layout
                const screenAddr = this.getScreenAddress(x, y);
                const pixelByte = screenMemory[screenAddr];
                
                // Get attribute for this character cell
                const attrAddr = Math.floor(y / 8) * 32 + x;
                const attr = attributeMemory[attrAddr];
                
                // Use pre-computed attribute data
                const attrData = this.attributeCache[attr];
                let inkColor = attrData.ink;
                let paperColor = attrData.paper;
                
                // Apply flash effect by swapping ink and paper colors
                if (attrData.flash && this.flashPhase) {
                    const temp = inkColor;
                    inkColor = paperColor;
                    paperColor = temp;
                }
                
                // Render 8 pixels
                for (let bit = 0; bit < 8; bit++) {
                    const pixel = (pixelByte >> (7 - bit)) & 0x01;
                    const color = pixel ? inkColor : paperColor;
                    
                    // Calculate position in display buffer
                    const px = x * 8 + bit + this.borderLeft;
                    const py = y + this.borderTop;
                    const offset = (py * this.totalWidth + px) * 4;
                    
                    // Set pixel color
                    this.displayBuffer[offset] = this.palette[color][0];
                    this.displayBuffer[offset + 1] = this.palette[color][1];
                    this.displayBuffer[offset + 2] = this.palette[color][2];
                    this.displayBuffer[offset + 3] = this.palette[color][3];
                }
            }
        }
        
        return this.displayBuffer;
    }

    /**
     * Calculate screen memory address for given coordinates
     * Implements the ZX Spectrum's non-linear screen memory layout
     * 
     * The address calculation splits the Y coordinate into sections:
     * - Y7,Y6 determine the third of the screen
     * - Y5,Y4,Y3 determine the character row within the third
     * - Y2,Y1,Y0 determine the pixel row within the character
     * 
     * @private
     * @param {number} x - Character column (0-31)
     * @param {number} y - Pixel row (0-191)
     * @returns {number} Memory offset within screen area (0-6143)
     * 
     * @example
     * const addr = this.getScreenAddress(0, 0);   // Returns 0
     * const addr = this.getScreenAddress(0, 8);   // Returns 256
     * const addr = this.getScreenAddress(0, 64);  // Returns 2048
     */
    getScreenAddress(x, y) {
        // Split y into components
        const y7 = (y >> 7) & 0x01;
        const y6 = (y >> 6) & 0x01;
        const y5 = (y >> 5) & 0x01;
        const y4 = (y >> 4) & 0x01;
        const y3 = (y >> 3) & 0x01;
        const y2 = (y >> 2) & 0x01;
        const y1 = (y >> 1) & 0x01;
        const y0 = y & 0x01;
        
        // Calculate address
        return (y7 << 12) | (y6 << 11) | (y2 << 10) | (y1 << 9) | (y0 << 8) |
               (y5 << 7) | (y4 << 6) | (y3 << 5) | x;
    }

    /**
     * Fill the border with the specified color
     * 
     * @private
     * @param {number} borderColor - Color index (0-7)
     * @returns {void}
     */
    fillBorder(borderColor) {
        const color = this.palette[borderColor & 0x07];
        
        // Top border
        for (let y = 0; y < this.borderTop; y++) {
            for (let x = 0; x < this.totalWidth; x++) {
                const offset = (y * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
        }
        
        // Bottom border
        for (let y = this.totalHeight - this.borderBottom; y < this.totalHeight; y++) {
            for (let x = 0; x < this.totalWidth; x++) {
                const offset = (y * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
        }
        
        // Left and right borders (for the screen area)
        for (let y = this.borderTop; y < this.totalHeight - this.borderBottom; y++) {
            // Left border
            for (let x = 0; x < this.borderLeft; x++) {
                const offset = (y * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
            
            // Right border
            for (let x = this.totalWidth - this.borderRight; x < this.totalWidth; x++) {
                const offset = (y * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
        }
    }

    /**
     * Fill border with per-scanline colors for multicolor effects
     * Used for demos and games that change border color mid-frame
     * 
     * @private
     * @param {Uint8Array} scanlineBorderColors - Array of 312 color values (one per scanline)
     * @returns {void}
     */
    fillBorderWithScanlines(scanlineBorderColors) {
        if (!scanlineBorderColors || scanlineBorderColors.length < 312) {
            this.fillBorder(7); // Default white border
            return;
        }
        
        // Constants for ZX Spectrum timing
        const firstVisibleScanline = 64;
        const visibleScanlines = 192;
        const topBorderScanlines = 48;
        
        // Top border (scanlines 64-111, displayed in 48 pixel rows)
        for (let y = 0; y < this.borderTop; y++) {
            const scanline = firstVisibleScanline - topBorderScanlines + y;
            const color = this.palette[scanlineBorderColors[scanline] & 0x07];
            
            for (let x = 0; x < this.totalWidth; x++) {
                const offset = (y * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
        }
        
        // Side borders during screen area (scanlines 112-303)
        for (let y = 0; y < this.height; y++) {
            const scanline = firstVisibleScanline + y;
            const color = this.palette[scanlineBorderColors[scanline] & 0x07];
            const displayY = y + this.borderTop;
            
            // Left border
            for (let x = 0; x < this.borderLeft; x++) {
                const offset = (displayY * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
            
            // Right border
            for (let x = this.totalWidth - this.borderRight; x < this.totalWidth; x++) {
                const offset = (displayY * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
        }
        
        // Bottom border (scanlines 304-311 and 0-63, displayed in 56 pixel rows)
        for (let y = 0; y < this.borderBottom; y++) {
            const displayY = this.borderTop + this.height + y;
            const scanline = firstVisibleScanline + visibleScanlines + y;
            const actualScanline = scanline < 312 ? scanline : scanline - 312;
            const color = this.palette[scanlineBorderColors[actualScanline] & 0x07];
            
            for (let x = 0; x < this.totalWidth; x++) {
                const offset = (displayY * this.totalWidth + x) * 4;
                this.displayBuffer[offset] = color[0];
                this.displayBuffer[offset + 1] = color[1];
                this.displayBuffer[offset + 2] = color[2];
                this.displayBuffer[offset + 3] = color[3];
            }
        }
    }

    /**
     * Get display dimensions including border
     * 
     * @returns {Object} Display dimensions
     * @returns {number} .width - Total width including border (352)
     * @returns {number} .height - Total height including border (296)
     * @returns {number} .screenWidth - Screen area width (256)
     * @returns {number} .screenHeight - Screen area height (192)
     * @returns {number} .borderTop - Top border size (48)
     * @returns {number} .borderBottom - Bottom border size (56)
     * @returns {number} .borderLeft - Left border size (48)
     * @returns {number} .borderRight - Right border size (48)
     * 
     * @example
     * const size = display.getDisplaySize();
     * canvas.width = size.width;
     * canvas.height = size.height;
     */
    getDisplaySize() {
        return {
            width: this.totalWidth,
            height: this.totalHeight,
            screenWidth: this.width,
            screenHeight: this.height,
            borderTop: this.borderTop,
            borderBottom: this.borderBottom,
            borderLeft: this.borderLeft,
            borderRight: this.borderRight
        };
    }
    
    /**
     * Get ImageData object for canvas rendering
     * Creates a new ImageData from the current display buffer
     * 
     * @returns {ImageData} ImageData object ready for canvas putImageData
     * 
     * @example
     * const imageData = display.getImageData();
     * ctx.putImageData(imageData, 0, 0);
     */
    getImageData() {
        // Create ImageData object with the display buffer
        return new ImageData(
            new Uint8ClampedArray(this.displayBuffer),
            this.totalWidth,
            this.totalHeight
        );
    }
}