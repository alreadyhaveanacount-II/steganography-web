import { ChaCha20 } from "../pkg/rust_src.js"

async function expand_key(text_pwd, salt) {
    const encoder = new TextEncoder();

    const basekey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(text_pwd),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
    )

    return await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: 600000,
            hash: "SHA-256"
        },
        basekey,
        352
    )
}

/** 
 * @param {ArrayBuffer} raw
 * @returns {Array<{key: Uint8Array, salt: Uint8Array}>}
 */
function breakKey(raw) {
    const combinedView = new Uint8Array(raw);
    
    const keyBytes = combinedView.slice(0, 32);
    const nonceBytes = combinedView.slice(32, 44);

    return [keyBytes, nonceBytes];
}

class SimpleCSPRNG {
    #chachaBase = null;
    #buffer = null;
    #bytePointer = 0;
    #bufferSize = 4096; // 4KB = 32.768 bits de uma vez

    constructor(base) {
        this.#chachaBase = base;
        this.#refreshBuffer();
    }

    #refreshBuffer() {
        this.#buffer = new Uint8Array(this.#bufferSize);
        this.#chachaBase.process(this.#buffer, this.#buffer);
        this.#bytePointer = 0;
    }

    rand32bit() {
        if (this.#bytePointer > this.#bufferSize - 4) {
            this.#refreshBuffer();
        }
        
        const view = new DataView(this.#buffer.buffer, this.#bytePointer);
        const val = view.getUint32(0, true);
        this.#bytePointer += 4;
        
        return val;
    }
}

/**
 * Generates an imagedata where the content is hidden
 * @param {ImageData} imagedata - The image's bitmap.
 * @param {Uint8Array} content - The plaintext content as bytes
 * @param {String} password - Password for encryption and stego
 * @param {String} stego_salt - Salt for stego
 * @param {String} crypto_salt - Salt for cryptography
 * @param {Number} chip_amount - Amount of chips used
 * @returns {ImageData} - The new image data with the encrypted content embedded
 */
async function mix_data_in_image(imagedata, content, password, stego_salt, crypto_salt, chip_amount=64) {
    const pixels = new Uint32Array(imagedata.data.buffer);
    const totalPixels = pixels.length;
    
    const totalRequiredBits = (4 + content.length) * 8 * chip_amount;
    if (totalRequiredBits > totalPixels) {
        alert("Mensagem não cabe na imagem, tente usar menos chips");
        return imagedata;
    }

    const derivedEnc = await expand_key(password, crypto_salt);
    const [enc_key, enc_nonce] = breakKey(derivedEnc);
    const enc_cipher = new ChaCha20(new Uint32Array(enc_key), new Uint32Array(enc_nonce));
    enc_cipher.process(content, content);

    const derivedStego = await expand_key(password, stego_salt);
    const [stego_key, stego_nonce] = breakKey(derivedStego);
    const stego_cipher = new ChaCha20(new Uint32Array(stego_key), new Uint32Array(stego_nonce));
    const stego_csprng = new SimpleCSPRNG(stego_cipher);

    let available_indexes = new Uint32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) available_indexes[i] = i;

    for (let i = totalPixels - 1; i > 0; i--) {
        const j = stego_csprng.rand32bit() % (i + 1);
        [available_indexes[i], available_indexes[j]] = [available_indexes[j], available_indexes[i]];
    }

    let current_idx_ptr = 0;

    const contentLen = content.length;
    const sizeBuffer = new Uint32Array([contentLen]);
    const sizeBytes = new Uint8Array(sizeBuffer.buffer);
    const fullPayload = new Uint8Array(sizeBytes.length + content.length);
    fullPayload.set(sizeBytes);
    fullPayload.set(content, sizeBytes.length);

    for (let byte of fullPayload) {
        for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
            const msgBit = (byte >> bitIdx) & 1;
            let chips_buff = 0;

            for (let chipIdx = 0; chipIdx < chip_amount; chipIdx++) {
                if (chipIdx % 32 === 0) chips_buff = stego_csprng.rand32bit();
                
                let curr_chip = (chips_buff >> (chipIdx % 32)) & 1;
                let stego_bit = curr_chip ^ msgBit;

                let pixel_idx = available_indexes[current_idx_ptr++];
                
                pixels[pixel_idx] = (pixels[pixel_idx] & 0xFFFFFFFE) | stego_bit;
            }
        }
    }
    
    return imagedata;
}

/**
 * Finds content hidden in an image data
 * @param {ImageData} imagedata - The image's bitmap.
 * @param {String} password - Password for encryption and stego
 * @param {String} stego_salt - Salt for stego
 * @param {String} crypto_salt - Salt for cryptography
 * @param {Number} chip_amount - Amount of chips used
 * @returns {Uint8Array} - The content hidden in the image, in bytes
 */
async function extract_data_from_image(imagedata, password, stego_salt, crypto_salt, chip_amount=64, tolerance=.5) {
    const pixels = new Uint32Array(imagedata.data.buffer);
    const totalPixels = pixels.length;

    const derivedStego = await expand_key(password, stego_salt);
    const [stego_key, stego_nonce] = breakKey(derivedStego);
    const stego_cipher = new ChaCha20(new Uint32Array(stego_key), new Uint32Array(stego_nonce));
    const stego_csprng = new SimpleCSPRNG(stego_cipher);

    let available_indexes = new Uint32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) available_indexes[i] = i;

    for (let i = totalPixels - 1; i > 0; i--) {
        const j = stego_csprng.rand32bit() % (i + 1);
        [available_indexes[i], available_indexes[j]] = [available_indexes[j], available_indexes[i]];
    }

    let current_idx_ptr = 0;

    const sizeBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        let byte = 0;
        for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
            let chips_buff = 0;
            let votes = 0;
            for (let chipIdx = 0; chipIdx < chip_amount; chipIdx++) {
                if (chipIdx % 32 === 0) chips_buff = stego_csprng.rand32bit();
                
                let curr_chip = (chips_buff >> (chipIdx % 32)) & 1;
                let pixel_idx = available_indexes[current_idx_ptr++];
                
                if (((pixels[pixel_idx] & 1) ^ curr_chip) === 1) votes++;
            }

            if (votes > (chip_amount * tolerance)) byte |= (1 << bitIdx);
        }
        sizeBytes[i] = byte;
    }

    const contentLen = new DataView(sizeBytes.buffer).getUint32(0, true);

    if (contentLen === 0 || (contentLen * 8 * chip_amount) > (totalPixels - current_idx_ptr)) {
        console.error("Dados inválidos ou senha incorreta.");
        return null;
    }

    const extractedContent = new Uint8Array(contentLen);
    for (let i = 0; i < contentLen; i++) {
        let byte = 0;
        for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
            let chips_buff = 0;
            let votes = 0;
            for (let chipIdx = 0; chipIdx < chip_amount; chipIdx++) {
                if (chipIdx % 32 === 0) chips_buff = stego_csprng.rand32bit();
                
                let curr_chip = (chips_buff >> (chipIdx % 32)) & 1;
                let pixel_idx = available_indexes[current_idx_ptr++];

                if (((pixels[pixel_idx] & 1) ^ curr_chip) === 1) votes++;
            }
            if (votes > (chip_amount / 2)) byte |= (1 << bitIdx);
        }
        extractedContent[i] = byte;
    }

    const derivedEnc = await expand_key(password, crypto_salt);
    const [enc_key, enc_nonce] = breakKey(derivedEnc);
    const enc_cipher = new ChaCha20(new Uint32Array(enc_key), new Uint32Array(enc_nonce));
    enc_cipher.process(extractedContent, extractedContent);

    return extractedContent;
}

export { mix_data_in_image, extract_data_from_image }