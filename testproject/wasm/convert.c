// cmdline overridable defines
#ifndef CHUNK_SIZE
  #define CHUNK_SIZE 16384
#endif


/** operate on static memory for wasm */
static unsigned char CHUNK[CHUNK_SIZE] __attribute__((aligned(16)));
static unsigned char TARGET[CHUNK_SIZE/2] __attribute__((aligned(16)));


// exported functions
#ifdef __cplusplus
extern "C" {
#endif
  void* chunk_addr() { return &CHUNK[0]; }
  void* target_addr() { return &TARGET[0]; }
  int convert(int length);
#ifdef __cplusplus
}
#endif

#ifndef USE_SIMD

// scalar variant (safari)
int convert(int length) {
  unsigned char *src = CHUNK + 1;
  unsigned char *dst = TARGET;
  int len = length / 2;
  for (; len--; src += 2) {
    *dst++ = *src;
  }
  return dst - TARGET;
}

#else

// simd variant
#include <immintrin.h>
int convert(int length) {
  unsigned char *src = CHUNK;
  unsigned char *dst = TARGET;
  int len = length / 32;
  while(len--) {
    // 2x shift variant (faster than shuffle on wasm simd)
    __m128i v0 = _mm_loadu_si128((__m128i*) src);
    __m128i v1 = _mm_loadu_si128((__m128i*) (src + 16));
    v0 = _mm_srli_epi16(v0, 8);
    v1 = _mm_srli_epi16(v1, 8);
    __m128i pack = _mm_packus_epi16(v0, v1);
    _mm_storeu_si128((__m128i*) dst, pack);
    dst += 16;
    src += 32;
  }
  // FIXME: implement tail handling
  return dst - TARGET;
}

#endif
