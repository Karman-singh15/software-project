// TMP36: VOUT = 500 mV + 10 mV per °C
#include "wokwi-api.h"
#include <stdlib.h>

typedef struct { pin_t out; uint32_t temp; } chip_t;

static void update(void *data) {
  chip_t *c = data;
  pin_dac_write(c->out, 0.5 + attr_read_float(c->temp) / 100.0);
}

void chip_init(void) {
  chip_t *c = malloc(sizeof(chip_t));
  c->out = pin_init("VOUT", ANALOG);
  c->temp = attr_init_float("temperature", 25);
  const timer_config_t cfg = { .callback = update, .user_data = c };
  timer_start(timer_init(&cfg), 100000, true);
}
