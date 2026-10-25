// Water level sensor: S rises from 0 V (dry) to ~1.6 V (fully submerged) at 3.3 V supply
#include "wokwi-api.h"
#include <stdlib.h>

typedef struct { pin_t out; uint32_t level; } chip_t;

static void update(void *data) {
  chip_t *c = data;
  pin_dac_write(c->out, 1.6 * attr_read_float(c->level) / 100.0);
}

void chip_init(void) {
  chip_t *c = malloc(sizeof(chip_t));
  c->out = pin_init("S", ANALOG);
  c->level = attr_init_float("level", 60);
  const timer_config_t cfg = { .callback = update, .user_data = c };
  timer_start(timer_init(&cfg), 100000, true);
}
