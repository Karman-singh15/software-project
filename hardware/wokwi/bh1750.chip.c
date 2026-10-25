// BH1750 light sensor at 0x23 (ADDR low). Always measuring; returns lux * 1.2 as a big-endian 16-bit word.
#include "wokwi-api.h"
#include <stdlib.h>

typedef struct { uint32_t lux; uint16_t raw; int idx; } chip_t;

static bool on_connect(void *data, uint32_t address, bool read) {
  chip_t *c = data;
  float v = attr_read_float(c->lux) * 1.2;
  c->raw = v > 65535 ? 65535 : (uint16_t)v;
  c->idx = 0;
  return true;
}

static uint8_t on_read(void *data) {
  chip_t *c = data;
  return c->idx++ == 0 ? c->raw >> 8 : c->raw & 0xff;
}

static bool on_write(void *data, uint8_t cmd) { return true; }  // mode commands are accepted and ignored

static void on_disconnect(void *data) {}

void chip_init(void) {
  chip_t *c = malloc(sizeof(chip_t));
  c->lux = attr_init_float("lux", 800);
  const i2c_config_t cfg = {
    .user_data = c,
    .address = 0x23,
    .scl = pin_init("SCL", INPUT),
    .sda = pin_init("SDA", INPUT),
    .connect = on_connect,
    .read = on_read,
    .write = on_write,
    .disconnect = on_disconnect,
  };
  i2c_init(&cfg);
}
