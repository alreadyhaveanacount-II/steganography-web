use wasm_bindgen::prelude::*;
use core::arch::wasm32::*;

#[wasm_bindgen]
pub struct ChaCha20 {
    state: [v128; 16],
}

#[wasm_bindgen]
impl ChaCha20 {
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u32], nonce: &[u32]) -> ChaCha20 {
        unsafe {
            let mut state = [u32x4_splat(0); 16];
            state[0] = u32x4_splat(0x61707865);
            state[1] = u32x4_splat(0x3320646e);
            state[2] = u32x4_splat(0x79622d32);
            state[3] = u32x4_splat(0x6b206574);

            for i in 0..8 {
                state[4 + i] = u32x4_splat(key[i]);
            }

            state[12] = u32x4(0, 1, 2, 3); 

            for i in 0..3 {
                state[13 + i] = u32x4_splat(nonce[i]);
            }

            ChaCha20 { state }
        }
    }

    pub fn set_counter(&mut self, ctr: u32) {
        unsafe {
            self.state[12] = u32x4_add(u32x4_splat(ctr), u32x4(0, 1, 2, 3));
        }
    }

    fn block_function_internal(&mut self, ks_out: &mut [v128; 16]) {
        unsafe {
            let mut working_state = self.state; 
            let s = working_state.as_mut_ptr();

            for _ in 0..10 {
                quarter_round(&mut *s.add(0), &mut *s.add(4), &mut *s.add(8), &mut *s.add(12));
                quarter_round(&mut *s.add(1), &mut *s.add(5), &mut *s.add(9), &mut *s.add(13));
                quarter_round(&mut *s.add(2), &mut *s.add(6), &mut *s.add(10), &mut *s.add(14));
                quarter_round(&mut *s.add(3), &mut *s.add(7), &mut *s.add(11), &mut *s.add(15));

                quarter_round(&mut *s.add(0), &mut *s.add(5), &mut *s.add(10), &mut *s.add(15));
                quarter_round(&mut *s.add(1), &mut *s.add(6), &mut *s.add(11), &mut *s.add(12));
                quarter_round(&mut *s.add(2), &mut *s.add(7), &mut *s.add(8), &mut *s.add(13));
                quarter_round(&mut *s.add(3), &mut *s.add(4), &mut *s.add(9), &mut *s.add(14));
            }

            for i in 0..16 {
                working_state[i] = u32x4_add(working_state[i], self.state[i]);
            }

            transpose_4x16(ks_out, &working_state);
            self.state[12] = u32x4_add(self.state[12], u32x4_splat(4));
        }
    }

    pub fn process(&mut self, input: &[u8], output: &mut [u8]) {
        let length = input.len();
        let mut processed = 0;
        let chunk_size = 256;
        let full_chunks = length / chunk_size;

        for _ in 0..full_chunks {
            unsafe {
                let mut ks = [u32x4_splat(0); 16];
                self.block_function_internal(&mut ks);
                
                for j in 0..16 {
                    let offset = processed + (j * 16);
                    let in_vec = v128_load(input.as_ptr().add(offset) as *const v128);
                    let out_vec = v128_xor(in_vec, ks[j]);
                    v128_store(output.as_mut_ptr().add(offset) as *mut v128, out_vec);
                }
            }
            processed += chunk_size;
        }

        if processed < length {
            unsafe {
                let mut ks = [u32x4_splat(0); 16];
                self.block_function_internal(&mut ks);
                let remaining = length - processed;
                let ks_bytes: [u8; 256] = std::mem::transmute(ks);
                for i in 0..remaining {
                    output[processed + i] = input[processed + i] ^ ks_bytes[i];
                }
            }
        }
    }
}

#[inline]
unsafe fn u32x4_rotl(v: v128, n: u32) -> v128 {
    v128_or(u32x4_shl(v, n), u32x4_shr(v, 32 - n))
}

#[inline]
unsafe fn quarter_round(a: &mut v128, b: &mut v128, c: &mut v128, d: &mut v128) {
    *a = u32x4_add(*a, *b); *d = v128_xor(*d, *a); *d = u32x4_rotl(*d, 16);
    *c = u32x4_add(*c, *d); *b = v128_xor(*b, *c); *b = u32x4_rotl(*b, 12);
    *a = u32x4_add(*a, *b); *d = v128_xor(*d, *a); *d = u32x4_rotl(*d, 8);
    *c = u32x4_add(*c, *d); *b = v128_xor(*b, *c); *b = u32x4_rotl(*b, 7);
}

#[inline]
unsafe fn transpose_4x16(blocks: &mut [v128; 16], state: &[v128; 16]) {
    for i in (0..16).step_by(4) {
        let s0 = state[i];     // Word X
        let s1 = state[i + 1]; // Word X+1
        let s2 = state[i + 2]; // Word X+2
        let s3 = state[i + 3]; // Word X+3

        // Passo 1: Intercalar os elementos de 32 bits (Simula o unpack_lo/hi)
        // Shuffle <0, 4, 1, 5> pega os dois primeiros de s0 e s1 intercalados
        let tmp0 = i32x4_shuffle::<0, 4, 1, 5>(s0, s1); 
        let tmp1 = i32x4_shuffle::<2, 6, 3, 7>(s0, s1); 
        let tmp2 = i32x4_shuffle::<0, 4, 1, 5>(s2, s3); 
        let tmp3 = i32x4_shuffle::<2, 6, 3, 7>(s2, s3); 

        // Passo 2: Combinar os pares de 64 bits para formar os blocos finais
        blocks[i]     = i64x2_shuffle::<0, 2>(tmp0, tmp2); 
        blocks[i + 1] = i64x2_shuffle::<1, 3>(tmp0, tmp2);
        blocks[i + 2] = i64x2_shuffle::<0, 2>(tmp1, tmp3);
        blocks[i + 3] = i64x2_shuffle::<1, 3>(tmp1, tmp3);
    }
}
