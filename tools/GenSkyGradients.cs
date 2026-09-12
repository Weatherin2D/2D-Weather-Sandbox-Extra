using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

/// <summary>
/// Rebuild sky phase strips as continuous float gradients with Floyd–Steinberg
/// dithering so 8-bit PNGs do not show horizontal banding stripes.
/// </summary>
class GenSkyGradients {
  static float Clamp01(float v) {
    if (v < 0f) return 0f;
    if (v > 1f) return 1f;
    return v;
  }

  static float Smooth(float t) {
    t = Clamp01(t);
    return t * t * (3f - 2f * t);
  }

  static void Rgb(Color c, out float r, out float g, out float b) {
    r = c.R / 255f; g = c.G / 255f; b = c.B / 255f;
  }

  static Color FromRgb(float r, float g, float b) {
    return Color.FromArgb(
      (int)Math.Round(Clamp01(r) * 255.0),
      (int)Math.Round(Clamp01(g) * 255.0),
      (int)Math.Round(Clamp01(b) * 255.0));
  }

  static void LerpRgb(float r0, float g0, float b0, float r1, float g1, float b1, float t,
                      out float r, out float g, out float b) {
    t = Clamp01(t);
    r = r0 + (r1 - r0) * t;
    g = g0 + (g1 - g0) * t;
    b = b0 + (b1 - b0) * t;
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

  static void BuildSeries(Bitmap src, out float[] R, out float[] G, out float[] B) {
    int n = Math.Max(8, src.Height);
    R = new float[n]; G = new float[n]; B = new float[n];
    for (int y = 0; y < n; y++) {
      Color c = RowMedian(src, Math.Min(src.Height - 1, y));
      R[y] = c.R / 255f; G[y] = c.G / 255f; B[y] = c.B / 255f;
    }
    // Wide blur in float space — kills discrete bands before resampling.
    for (int pass = 0; pass < 120; pass++) {
      var nR = new float[n]; var nG = new float[n]; var nB = new float[n];
      for (int i = 0; i < n; i++) {
        int i0 = Math.Max(0, i - 4);
        int i1 = Math.Max(0, i - 2);
        int i2 = Math.Min(n - 1, i + 2);
        int i3 = Math.Min(n - 1, i + 4);
        nR[i] = (R[i0] + R[i1] * 2f + R[i] * 4f + R[i2] * 2f + R[i3]) / 10f;
        nG[i] = (G[i0] + G[i1] * 2f + G[i] * 4f + G[i2] * 2f + G[i3]) / 10f;
        nB[i] = (B[i0] + B[i1] * 2f + B[i] * 4f + B[i2] * 2f + B[i3]) / 10f;
      }
      R = nR; G = nG; B = nB;
    }
  }

  static void Sample(float[] R, float[] G, float[] B, float u, out float r, out float g, out float b) {
    u = Clamp01(u);
    float f = u * (R.Length - 1);
    int i0 = (int)Math.Floor(f);
    int i1 = Math.Min(R.Length - 1, i0 + 1);
    float t = Smooth(f - i0);
    LerpRgb(R[i0], G[i0], B[i0], R[i1], G[i1], B[i1], t, out r, out g, out b);
  }

  static void ExtractColourSpan(float[] sR, float[] sG, float[] sB, float srcBlack,
                                out float[] cR, out float[] cG, out float[] cB) {
    int len = Math.Max(256, (int)(sR.Length * (1f - srcBlack)));
    cR = new float[len]; cG = new float[len]; cB = new float[len];
    for (int i = 0; i < len; i++) {
      float u = srcBlack + (1f - srcBlack) * (i / (float)(len - 1));
      Sample(sR, sG, sB, u, out cR[i], out cG[i], out cB[i]);
    }
    for (int pass = 0; pass < 60; pass++) {
      var nR = new float[len]; var nG = new float[len]; var nB = new float[len];
      for (int i = 0; i < len; i++) {
        int i0 = Math.Max(0, i - 3);
        int i1 = Math.Max(0, i - 1);
        int i2 = Math.Min(len - 1, i + 1);
        int i3 = Math.Min(len - 1, i + 3);
        nR[i] = (cR[i0] + cR[i1] * 2f + cR[i] * 3f + cR[i2] * 2f + cR[i3]) / 9f;
        nG[i] = (cG[i0] + cG[i1] * 2f + cG[i] * 3f + cG[i2] * 2f + cG[i3]) / 9f;
        nB[i] = (cB[i0] + cB[i1] * 2f + cB[i] * 3f + cB[i2] * 2f + cB[i3]) / 9f;
      }
      cR = nR; cG = nG; cB = nB;
    }
  }

  static void Rebuild(string srcPath, string dstPath, int outW, int outH, float blackFrac) {
    using (var src = new Bitmap(srcPath)) {
      float[] sR, sG, sB;
      BuildSeries(src, out sR, out sG, out sB);
      // Skip baked pure-black at the source top — keep the full colour story only.
      int colourStart = 0;
      for (int i = 0; i < sR.Length; i++) {
        float lum = 0.2126f * sR[i] + 0.7152f * sG[i] + 0.0722f * sB[i];
        if (lum > 0.035f) { colourStart = i; break; }
      }
      float srcBlack = colourStart / (float)Math.Max(1, sR.Length - 1);
      srcBlack = Math.Max(0.02f, Math.Min(0.55f, srcBlack));
      float[] cR, cG, cB;
      ExtractColourSpan(sR, sG, sB, srcBlack, out cR, out cG, out cB);

      // Float framebuffer for Floyd–Steinberg (one column, then copy across width).
      var fr = new float[outH];
      var fg = new float[outH];
      var fb = new float[outH];
      for (int y = 0; y < outH; y++) {
        float fn = y / (float)(outH - 1); // 0 top, 1 bottom
        float r, g, b;
        // Full strip is colour zenith → horizon (no hard black lid).
        Sample(cR, cG, cB, fn, out r, out g, out b);
        fr[y] = r; fg[y] = g; fb[y] = b;
      }

      // Vertical Floyd–Steinberg on the 1D strip, then light horizontal noise per x.
      var qr = new byte[outH];
      var qg = new byte[outH];
      var qb = new byte[outH];
      for (int y = 0; y < outH; y++) {
        float oldR = fr[y], oldG = fg[y], oldB = fb[y];
        byte nr = (byte)Math.Round(Clamp01(oldR) * 255.0);
        byte ng = (byte)Math.Round(Clamp01(oldG) * 255.0);
        byte nb = (byte)Math.Round(Clamp01(oldB) * 255.0);
        qr[y] = nr; qg[y] = ng; qb[y] = nb;
        float errR = oldR - nr / 255f;
        float errG = oldG - ng / 255f;
        float errB = oldB - nb / 255f;
        if (y + 1 < outH) {
          fr[y + 1] += errR * 7f / 16f;
          fg[y + 1] += errG * 7f / 16f;
          fb[y + 1] += errB * 7f / 16f;
        }
        if (y + 2 < outH) {
          fr[y + 2] += errR * 5f / 16f;
          fg[y + 2] += errG * 5f / 16f;
          fb[y + 2] += errB * 5f / 16f;
        }
        if (y + 3 < outH) {
          fr[y + 3] += errR * 3f / 16f;
          fg[y + 3] += errG * 3f / 16f;
          fb[y + 3] += errB * 3f / 16f;
        }
        if (y + 4 < outH) {
          fr[y + 4] += errR * 1f / 16f;
          fg[y + 4] += errG * 1f / 16f;
          fb[y + 4] += errB * 1f / 16f;
        }
      }

      using (var bmp = new Bitmap(outW, outH, PixelFormat.Format24bppRgb)) {
        var rnd = new Random(0x5C71);
        for (int y = 0; y < outH; y++) {
          for (int x = 0; x < outW; x++) {
            // Tiny per-pixel jitter so LINEAR filtering averages away residual bands.
            int j = rnd.Next(-1, 2);
            bmp.SetPixel(x, y, Color.FromArgb(
              Math.Max(0, Math.Min(255, qr[y] + j)),
              Math.Max(0, Math.Min(255, qg[y] + j)),
              Math.Max(0, Math.Min(255, qb[y] + j))));
          }
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(dstPath)));
        bmp.Save(dstPath, ImageFormat.Png);
        Color hor = FromRgb(cR[cR.Length - 1], cG[cG.Length - 1], cB[cB.Length - 1]);
        Console.WriteLine("Wrote " + Path.GetFileName(dstPath)
          + "  horizon=" + hor.R + "," + hor.G + "," + hor.B);
      }
    }
  }

  static void Main(string[] args) {
    string skyDir = args.Length > 0 ? args[0] : @"resources\img\sky";
    string srcDir = args.Length > 1 ? args[1] : Path.Combine(skyDir, "_pdf_extract");

    var fromPdf = new[] {
      Tuple.Create("img_1.jpg", "sky_night.png"),
      Tuple.Create("img_2.jpg", "sky_civil_twilight.png"),
      Tuple.Create("img_3.jpg", "sky_sunrise_sunset.png"),
      Tuple.Create("img_0.jpg", "sky_golden_hour.png"),
      Tuple.Create("img_4.jpg", "sky_early_golden.png"),
    };
    var fromSelf = new[] {
      "sky_night.png",
      "sky_civil_twilight.png",
      "sky_sunrise_sunset.png",
      "sky_golden_hour.png",
      "sky_early_golden.png",
    };

    const int W = 32;
    const int H = 4096;
    // No baked black lid — colour zenith→horizon only. Procedural zenith darkens overscan.
    const float blackFrac = 0.0f;

    bool usePdf = Directory.Exists(srcDir) && File.Exists(Path.Combine(srcDir, "img_0.jpg"));
    if (usePdf) {
      Console.WriteLine("Rebuilding from PDF extracts in " + srcDir);
      foreach (var m in fromPdf)
        Rebuild(Path.Combine(srcDir, m.Item1), Path.Combine(skyDir, m.Item2), W, H, blackFrac);
    } else {
      Console.WriteLine("PDF extracts missing — re-smoothing existing phase PNGs in " + skyDir);
      string tmp = Path.Combine(skyDir, "_tmp_smooth");
      Directory.CreateDirectory(tmp);
      foreach (var name in fromSelf) {
        string src = Path.Combine(skyDir, name);
        string mid = Path.Combine(tmp, name);
        File.Copy(src, mid, true);
        Rebuild(mid, src, W, H, blackFrac);
      }
      try { Directory.Delete(tmp, true); } catch { /* ignore */ }
    }
  }
}
