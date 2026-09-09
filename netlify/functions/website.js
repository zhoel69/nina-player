exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const sourceUrl = params.url;

    if (!sourceUrl) {
      return response(400, {
        error: "Masukkan URL website terlebih dahulu."
      });
    }

    let pageUrl;

    try {
      pageUrl = new URL(sourceUrl);
    } catch {
      return response(400, {
        error: "URL website tidak valid."
      });
    }

    const result = await fetch(pageUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      }
    });

    if (!result.ok) {
      return response(result.status, {
        error:
          `Website gagal diakses. HTTP ${result.status}`
      });
    }

    const html = await result.text();

    const baseUrl = new URL(
      pageUrl.origin
    );

    const links = [];

    /*
     * Cari semua tag <a href="...">
     */
    const linkRegex =
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
      (match = linkRegex.exec(html)) !== null
    ) {
      const href = match[1];
      const anchorHtml = match[2];

      /*
       * Bersihkan teks HTML
       */
      const title =
        anchorHtml
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      if (!href || !title) {
        continue;
      }

      /*
       * Buat URL absolut
       */
      let absoluteUrl;

      try {
        absoluteUrl =
          new URL(
            href,
            pageUrl.toString()
          );
      } catch {
        continue;
      }

      /*
       * Hanya ambil HTTP/HTTPS
       */
      if (
        absoluteUrl.protocol !== "http:" &&
        absoluteUrl.protocol !== "https:"
      ) {
        continue;
      }

      /*
       * Hanya link yang berasal dari domain
       * yang sama dengan halaman sumber.
       */
      if (
        absoluteUrl.hostname !==
        pageUrl.hostname
      ) {
        continue;
      }

      /*
       * Deteksi kemungkinan episode.
       *
       * Contoh yang cocok:
       * episode-1
       * episode-01
       * episode 1
       * eps-1
       * ep 1
       * episode_1
       */
      const episodePattern =
        /(?:episode|eps|ep)[\s_-]*(\d{1,4})/i;

      const urlMatch =
        absoluteUrl.pathname.match(
          episodePattern
        );

      const titleMatch =
        title.match(
          episodePattern
        );

      if (!urlMatch && !titleMatch) {
        continue;
      }

      const episodeNumber =
        (
          urlMatch?.[1] ||
          titleMatch?.[1] ||
          ""
        );

      links.push({
        url: absoluteUrl.toString(),

        title:
          title ||
          `Episode ${episodeNumber}`,

        episode:
          Number(episodeNumber) || 0,

        sourceType:
          "Website",

        sourceGroup:
          getSourceGroup(
            pageUrl.hostname
          ),

        thumbnail:
          "",

        youtubeId:
          "",

        publishedAt:
          ""
      });
    }

    /*
     * Hilangkan URL duplikat
     */
    const unique = [];

    const seen =
      new Set();

    for (const item of links) {
      if (seen.has(item.url)) {
        continue;
      }

      seen.add(item.url);
      unique.push(item);
    }

    /*
     * Urutkan berdasarkan nomor episode
     */
    unique.sort(
      (a, b) =>
        (a.episode || 999999) -
        (b.episode || 999999)
    );

    return response(200, {
      success: true,

      sourceUrl:
        pageUrl.toString(),

      sourceGroup:
        getSourceGroup(
          pageUrl.hostname
        ),

      total:
        unique.length,

      videos:
        unique
    });

  } catch (error) {
    console.error(
      "Website Import Error:",
      error
    );

    return response(500, {
      error:
        error?.message ||
        "Gagal membaca website."
    });
  }
};


/*
 * =========================
 * SOURCE GROUP
 * =========================
 */

function getSourceGroup(hostname) {

  return hostname
    .replace(/^www\./i, "")
    .replace(/^v1\./i, "")
    .split(".")[0] || "Website";

}


/*
 * =========================
 * RESPONSE
 * =========================
 */

function response(
  statusCode,
  body
) {

  return {
    statusCode,

    headers: {
      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type"
    },

    body:
      JSON.stringify(body)
  };
}
