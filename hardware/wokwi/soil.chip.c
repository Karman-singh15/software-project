// Resistive soil probe module: AO is high when dry (~3.1 V) and drops as the soil gets wet (~1.0 V)
#include "wokwi-api.h"
#include <stdlib.h>

typedef struct { pin_t out; uint32_t moisture; } chip_t;

static void update(void *data) {
  chip_t *c = data;
  pin_dac_write(c->out, 3.1 - 2.1 * attr_read_float(c->moisture) / 100.0);
}

void chip_init(void) {
  chip_t *c = malloc(sizeof(chip_t));
  c->out = pin_init("AO", ANALOG);
  c->moisture = attr_init_float("moisture", 45);
  const timer_config_t cfg = { .callback = update, .user_data = c };
  timer_start(timer_init(&cfg), 100000, true);
}
