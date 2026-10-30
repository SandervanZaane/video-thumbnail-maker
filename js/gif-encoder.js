// Minimale GIF-encoder (GIF89a) voor geanimeerde thumbnails, zonder externe
// bibliotheken. Werkt met één gedeeld palet van 255 kleuren (median cut) en
// lichte, vaste dithering, zodat stilstaande delen tussen frames niet flikkeren.
// Frames na het eerste mogen een deelgebied zijn; pixels die niet veranderen
// worden transparant opgeslagen, wat het bestand flink kleiner maakt.
// Voor diashows met verschillende foto's is er encodeSlides: elk frame krijgt
// dan een eigen palet, zodat elke foto zijn eigen kleuren houdt.
(() => {
  const TRANSPARENT = 255;
  const MAX_COLORS = 255;
  const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const DITHER_STRENGTH = 10;

  // Gedeeld werkgeheugen voor de LZW-woordenlijst (sleutel = prefix << 8 | pixel).
  const STAMP = new Int32Array(1 << 20);
  const CODES = new Uint16Array(1 << 20);
  let generation = 0;

  class ByteWriter {
    constructor() {
      this.buf = new Uint8Array(1 << 16);
      this.length = 0;
    }
    byte(b) {
      if (this.length === this.buf.length) {
        const bigger = new Uint8Array(this.buf.length * 2);
        bigger.set(this.buf);
        this.buf = bigger;
      }
      this.buf[this.length++] = b;
    }
    u16(v) {
      this.byte(v & 255);
      this.byte((v >> 8) & 255);
    }
    bytes(list) {
      for (let i = 0; i < list.length; i++) this.byte(list[i]);
    }
    ascii(text) {
      for (let i = 0; i < text.length; i++) this.byte(text.charCodeAt(i));
    }
    result() {
      return this.buf.slice(0, this.length);
    }
  }

  // --- Palet (median cut) ---

  function channelOf(color, shift) {
    return (color >> shift) & 255;
  }

  function makeBox(colors, start, end) {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (let i = start; i < end; i++) {
      const c = colors[i];
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    const ranges = [[rMax - rMin, 16], [gMax - gMin, 8], [bMax - bMin, 0]];
    ranges.sort((a, b) => b[0] - a[0]);
    return { start, end, range: ranges[0][0], shift: ranges[0][1] };
  }

  function buildPalette(colors, maxColors = MAX_COLORS) {
    const boxes = [makeBox(colors, 0, colors.length)];
    while (boxes.length < maxColors) {
      let best = -1;
      let bestScore = 0;
      boxes.forEach((box, i) => {
        const count = box.end - box.start;
        const score = count > 1 ? box.range * Math.sqrt(count) : 0;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best < 0) break;
      const box = boxes[best];
      const shift = box.shift;
      colors.subarray(box.start, box.end).sort((a, b) => channelOf(a, shift) - channelOf(b, shift));
      const mid = box.start + ((box.end - box.start) >> 1);
      boxes.splice(best, 1, makeBox(colors, box.start, mid), makeBox(colors, mid, box.end));
    }
    return boxes.map((box) => {
      let r = 0, g = 0, b = 0;
      for (let i = box.start; i < box.end; i++) {
        const c = colors[i];
        r += (c >> 16) & 255;
        g += (c >> 8) & 255;
        b += c & 255;
      }
      const n = box.end - box.start;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
  }

  function collectSamples(frames) {
    const samples = [];
    frames.forEach((frame, i) => {
      const pixels = frame.w * frame.h;
      const budget = i === 0 ? 60000 : 4000;
      const step = Math.max(1, Math.floor(pixels / budget));
      for (let p = 0; p < pixels; p += step) {
        const o = p * 4;
        samples.push((frame.data[o] << 16) | (frame.data[o + 1] << 8) | frame.data[o + 2]);
      }
    });
    return Uint32Array.from(samples);
  }

  // Zoekt per kleur (op 6 bits per kanaal) de dichtstbijzijnde paletkleur, met cache.
  function makeMapper(palette) {
    const cache = new Int16Array(1 << 18).fill(-1);
    return (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let index = cache[key];
      if (index < 0) {
        let bestDist = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const [pr, pg, pb] = palette[i];
          const d = (pr - r) * (pr - r) * 3 + (pg - g) * (pg - g) * 4 + (pb - b) * (pb - b) * 2;
          if (d < bestDist) {
            bestDist = d;
            index = i;
          }
        }
        cache[key] = index;
      }
      return index;
    };
  }

  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  function indexFrame(frame, map, dither = DITHER_STRENGTH) {
    const out = new Uint8Array(frame.w * frame.h);
    const d = frame.data;
    for (let y = 0; y < frame.h; y++) {
      const by = ((y + frame.y) & 3) * 4;
      for (let x = 0; x < frame.w; x++) {
        // Dithering op basis van de absolute positie: overal in elk frame gelijk.
        const offset = (BAYER_4X4[by + ((x + frame.x) & 3)] / 16 - 0.5) * dither;
        const o = (y * frame.w + x) * 4;
        out[y * frame.w + x] = map(clamp(d[o] + offset), clamp(d[o + 1] + offset), clamp(d[o + 2] + offset));
      }
    }
    return out;
  }

  // --- LZW-compressie met sub-blokken van max. 255 bytes ---

  function writeLzw(w, indices, minCodeSize = 8) {
    w.byte(minCodeSize);
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let next = eoiCode + 1;

    const block = new Uint8Array(255);
    let blockLength = 0;
    let bitBuffer = 0;
    let bitCount = 0;

    const pushByte = (b) => {
      block[blockLength++] = b;
      if (blockLength === 255) {
        w.byte(255);
        w.bytes(block);
        blockLength = 0;
      }
    };
    const emit = (code) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        pushByte(bitBuffer & 255);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    };

    generation++;
    emit(clearCode);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      if (STAMP[key] === generation) {
        prefix = CODES[key];
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        emit(clearCode);
        generation++;
        codeSize = minCodeSize + 1;
        next = eoiCode + 1;
      } else {
        if (next >= 1 << codeSize) codeSize++;
        STAMP[key] = generation;
        CODES[key] = next++;
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoiCode);
    if (bitCount > 0) pushByte(bitBuffer & 255);
    if (blockLength > 0) {
      w.byte(blockLength);
      w.bytes(block.subarray(0, blockLength));
    }
    w.byte(0);
  }

  // frames: [{ data: RGBA, x, y, w, h, delay (honderdsten van een seconde) }].
  // Het eerste frame moet het volledige beeld zijn.
  async function encode(width, height, frames, onProgress) {
    const palette = buildPalette(collectSamples(frames));
    const map = makeMapper(palette);
    const w = new ByteWriter();

    w.ascii('GIF89a');
    w.u16(width);
    w.u16(height);
    w.byte(0xf7); // globaal palet met 256 kleuren
    w.byte(0);
    w.byte(0);
    for (let i = 0; i < 256; i++) w.bytes(palette[i] || [0, 0, 0]);

    // Oneindig herhalen.
    w.byte(0x21); w.byte(0xff); w.byte(11);
    w.ascii('NETSCAPE2.0');
    w.byte(3); w.byte(1); w.u16(0); w.byte(0);

    const screen = new Uint8Array(width * height);
    for (let n = 0; n < frames.length; n++) {
      const frame = frames[n];
      const indices = indexFrame(frame, map);
      if (n === 0) {
        screen.set(indices);
      } else {
        for (let y = 0; y < frame.h; y++) {
          for (let x = 0; x < frame.w; x++) {
            const s = (frame.y + y) * width + frame.x + x;
            const j = y * frame.w + x;
            if (screen[s] === indices[j]) indices[j] = TRANSPARENT;
            else screen[s] = indices[j];
          }
        }
      }

      // Graphic Control Extension: frame laten staan, transparantie voor ongewijzigde pixels.
      w.byte(0x21); w.byte(0xf9); w.byte(4);
      w.byte((1 << 2) | (n > 0 ? 1 : 0));
      w.u16(frame.delay);
      w.byte(TRANSPARENT);
      w.byte(0);

      w.byte(0x2c);
      w.u16(frame.x); w.u16(frame.y); w.u16(frame.w); w.u16(frame.h);
      w.byte(0);
      writeLzw(w, indices);

      if (onProgress) onProgress(n + 1, frames.length);
      await window.Beeld.nextTick();
    }
    w.byte(0x3b);
    return w.result();
  }

  // Diashow: alle frames zijn volledige beelden, elk met een eigen palet.
  // options: { maxColors (2–256), dither (0 = uit) }; een frame kan beide
  // overschrijven met frame.colors en frame.dither.
  async function encodeSlides(width, height, frames, onProgress, { maxColors = 256, dither = DITHER_STRENGTH } = {}) {
    const w = new ByteWriter();
    w.ascii('GIF89a');
    w.u16(width);
    w.u16(height);
    w.byte(0x70); // geen globaal palet
    w.byte(0);
    w.byte(0);
    w.byte(0x21); w.byte(0xff); w.byte(11);
    w.ascii('NETSCAPE2.0');
    w.byte(3); w.byte(1); w.u16(0); w.byte(0);

    for (let n = 0; n < frames.length; n++) {
      const frame = frames[n];
      const palette = buildPalette(collectSamples([frame]), frame.colors ?? maxColors);
      // Kleinere paletten krijgen een kleinere tabel en kortere codes.
      const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
      const indices = indexFrame(frame, makeMapper(palette), frame.dither ?? dither);

      w.byte(0x21); w.byte(0xf9); w.byte(4);
      w.byte(1 << 2);
      w.u16(frame.delay);
      w.byte(0);
      w.byte(0);

      w.byte(0x2c);
      w.u16(0); w.u16(0); w.u16(width); w.u16(height);
      w.byte(0x80 | (bits - 1)); // lokaal palet
      for (let i = 0; i < 1 << bits; i++) w.bytes(palette[i] || [0, 0, 0]);
      writeLzw(w, indices, bits);

      if (onProgress) onProgress(n + 1, frames.length);
      await window.Beeld.nextTick();
    }
    w.byte(0x3b);
    return w.result();
  }

  window.GifEncoder = { encode, encodeSlides };
})();
