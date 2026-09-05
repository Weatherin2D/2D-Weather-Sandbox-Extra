using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

class GenSkyGradients {
  static float Smooth(float t) {
    t = Math.Max(0f, Math.Min(1f, t));
    return t * t * (3f - 2f * t);
  }

  static int ClampByte(double v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (int)Math.Round(v);
  }

  static Color Lerp(Color a, Color b, float t) {
    t = Smooth(t);
    return Color.FromArgb(
      ClampByte(a.R + (b.R - a.R) * t),
      ClampByte(a.G + (b.G - a.G) * t),
      ClampByte(a.B + (b.B - a.B) * t));
  }

  static Color RowMedian(Bitmap src, int y) {
    int w = src.Width;
    var rs = new int[w];
    var gs = new int[w];
    var bs = new int[w];
    for (int x = 0; x < w; x++) {
      Color p = src.GetPixel(x, y);
      rs[x] = p.R; gs[x] = p.G; bs[x] = p.B;
    }
    Array.Sort(rs); Array.Sort(gs); Array.Sort(bs);
    int m = w / 2;
    return Color.FromArgb(rs[m], gs[m], bs[m]);
  }

  static Color[] BuildSeries(Bitmap src) {
    int usableH = Math.Max(8, (int)(src.Height * 0.985));
    var series = new Color[usableH];
    for (int y = 0; y < usableH; y++) series[y] = RowMedian(src, y);
    // Heavy blur to kill JPEG banding before we pick stops
    for (int pass = 0; pass < 40; pass++) {
      var next = new Color[series.Length];
      for (int i = 0; i < series.Length; i++) {
        int i0 = Math.Max(0, i - 2);
        int i1 = Math.Max(0, i - 1);
        int i2 = Math.Min(series.Length - 1, i + 1);
        int i3 = Math.Min(series.Length - 1, i + 2);
        next[i] = Color.FromArgb(
          (series[i0].R + series[i1].R * 2 + series[i].R * 3 + series[i2].R * 2 + series[i3].R) / 9,
          (series[i0].G + series[i1].G * 2 + series[i].G * 3 + series[i2].G * 2 + series[i3].G) / 9,
          (series[i0].B + series[i1].B * 2 + series[i].B * 3 + series[i2].B * 2 + series[i3].B) / 9);
      }
      series = next;
    }
    return series;
  }

  static Color SampleSeries(Color[] series, float u) {
    u = Math.Max(0f, Math.Min(1f, u));
    float f = u * (series.Length - 1);
    int i0 = (int)Math.Floor(f);
    int i1 = Math.Min(series.Length - 1, i0 + 1);
    float t = f - i0;
    // linear here — series already heavily smoothed
    return Color.FromArgb(
      ClampByte(series[i0].R + (series[i1].R - series[i0].R) * t),
      ClampByte(series[i0].G + (series[i1].G - series[i0].G) * t),
      ClampByte(series[i0].B + (series[i1].B - series[i0].B) * t));
  }

  // Fit a small set of colour stops from the blurred series (relative to colour region only).
  static void ExtractStops(Color[] series, out Color[] cols, out float[] stops) {
    float[] us = { 0f, 0.12f, 0.28f, 0.45f, 0.62f, 0.78f, 0.90f, 1f };
    cols = new Color[us.Length];
    stops = us;
    for (int i = 0; i < us.Length; i++) cols[i] = SampleSeries(series, us[i]);
  }

  static Color SampleStops(Color[] cols, float[] stops, float u) {
    if (u <= stops[0]) return cols[0];
    if (u >= stops[stops.Length - 1]) return cols[cols.Length - 1];
    for (int i = 0; i < stops.Length - 1; i++) {
      if (u >= stops[i] && u <= stops[i + 1]) {
        float span = Math.Max(1e-6f, stops[i + 1] - stops[i]);
        return Lerp(cols[i], cols[i + 1], (u - stops[i]) / span);
      }
    }
    return cols[cols.Length - 1];
  }

  static void Rebuild(string srcPath, string dstPath, int outW, int outH, float blackFrac) {
    using (var src = new Bitmap(srcPath)) {
      Color[] series = BuildSeries(src);
      // Colour character comes from the lower ~62% of the source (below its own black).
      // Re-sample that region into our colour stops so blackFrac is ours, not JPEG's.
      float srcBlack = 0.36f;
      var colourSeries = new Color[Math.Max(8, (int)(series.Length * (1f - srcBlack)))];
      for (int i = 0; i < colourSeries.Length; i++) {
        float u = srcBlack + (1f - srcBlack) * (i / (float)(colourSeries.Length - 1));
        colourSeries[i] = SampleSeries(series, u);
      }
      Color[] cols; float[] stops;
      ExtractStops(colourSeries, out cols, out stops);

      using (var bmp = new Bitmap(outW, outH, PixelFormat.Format24bppRgb)) {
        for (int y = 0; y < outH; y++) {
          float fn = y / (float)(outH - 1); // 0 top, 1 bottom
          Color c;
          if (fn <= blackFrac) {
            // Pure black through the noon-aligned zenith band, then soft lift into first stop
            float edge = blackFrac * 0.82f;
            if (fn <= edge) {
              c = Color.Black;
            } else {
              float t = (fn - edge) / Math.Max(1e-6f, blackFrac - edge);
              c = Lerp(Color.Black, cols[0], t);
            }
          } else {
            float u = (fn - blackFrac) / Math.Max(1e-6f, 1f - blackFrac);
            c = SampleStops(cols, stops, u);
          }
          for (int x = 0; x < outW; x++) bmp.SetPixel(x, y, c);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(dstPath));
        bmp.Save(dstPath, ImageFormat.Png);
        Console.WriteLine("Wrote " + Path.GetFileName(dstPath) + " from " + Path.GetFileName(srcPath)
          + "  bot=" + cols[cols.Length - 1].R + "," + cols[cols.Length - 1].G + "," + cols[cols.Length - 1].B);
      }
    }
  }

  static void Main(string[] args) {
    string skyDir = args.Length > 0 ? args[0] : @"resources\img\sky";
    string srcDir = args.Length > 1 ? args[1] : Path.Combine(skyDir, "_pdf_extract");

    // PDF page order ≠ sensible phase colours: page1 is golden-yellow, page2 is true night-dark.
    // Remap by appearance to match the user's described phases:
    //   night, civil twilight, sunrise/sunset, golden hour, early golden
    var map = new[] {
      Tuple.Create("img_1.jpg", "sky_night.png"),           // darkest indigo
      Tuple.Create("img_2.jpg", "sky_civil_twilight.png"),   // dark blue → dusty peach
      Tuple.Create("img_3.jpg", "sky_sunrise_sunset.png"),   // vivid orange during sun event
      Tuple.Create("img_0.jpg", "sky_golden_hour.png"),      // yellow-gold just before/after
      Tuple.Create("img_4.jpg", "sky_early_golden.png"),     // pale blue toward day
    };

    const int W = 8;
    const int H = 2048;
    const float blackFrac = 0.38f;

    foreach (var m in map) {
      Rebuild(Path.Combine(srcDir, m.Item1), Path.Combine(skyDir, m.Item2), W, H, blackFrac);
    }
  }
}
