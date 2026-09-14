/*
 * Nina Universal Smart Video Player
 * Netlify Function: facebook.js
 *
 * Fungsi:
 * - Resolve Facebook /share/r/...
 * - Resolve Facebook /share/v/...
 * - Mengikuti redirect Facebook
 * - Mencari URL canonical Reel / Watch / Video
 * - Membersihkan parameter tracking
 * - Menangani URL Facebook yang berubah karena redirect
 * - Menghasilkan informasi debug
 * - Tidak membutuhkan package.json
 */

exports.handler = async function(event) {

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };


  /*
   * CORS preflight
   */

  if (event.httpMethod === "OPTIONS") {

    return {
      statusCode: 204,
      headers,
      body: ""
    };

  }


  /*
   * Hanya GET
   */

  if (
    event.httpMethod &&
    event.httpMethod !== "GET"
  ) {

    return response(
      405,
      {
        ok: false,
        error: "Method tidak diperbolehkan."
      },
      headers
    );

  }


  try {

    /*
     * Ambil URL dari query parameter.
     *
     * Contoh:
     *
     * /.netlify/functions/facebook?url=https://www.facebook.com/share/r/xxxxx/
     */

    const url =
      event.queryStringParameters &&
      event.queryStringParameters.url
        ? event.queryStringParameters.url
        : "";


    /*
     * URL wajib ada.
     */

    if (!url) {

      return response(
        400,
        {
          ok: false,
          error: "URL Facebook tidak diberikan."
        },
        headers
      );

    }


    /*
     * Validasi URL.
     */

    let inputUrl;

    try {

      inputUrl =
        new URL(
          String(url).trim()
        );

    } catch (error) {

      return response(
        400,
        {
          ok: false,
          error: "URL tidak valid."
        },
        headers
      );

    }


    /*
     * Pastikan URL memang Facebook.
     */

    if (
      !isFacebookUrl(
        inputUrl.toString()
      )
    ) {

      return response(
        400,
        {
          ok: false,
          error: "URL bukan URL Facebook yang valid."
        },
        headers
      );

    }


    /*
     * Simpan URL asli.
     */

    const originalUrl =
      inputUrl.toString();


    /*
     * Cek apakah URL merupakan
     * Facebook Share URL.
     */

    const isShareUrl =
      /\/share\/(r|v)\//i.test(
        inputUrl.pathname
      );


    /*
     * Resolve redirect Facebook.
     */

    const resolved =
      await resolveFacebookUrl(
        originalUrl
      );


    /*
     * Ambil URL hasil redirect.
     */

    let canonicalUrl =
      resolved.finalUrl ||
      originalUrl;


    /*
     * Bersihkan URL.
     */

    canonicalUrl =
      cleanFacebookUrl(
        canonicalUrl
      );


    /*
     * Apakah berhasil berubah dari
     * URL share menjadi URL lain?
     */

    let redirected =
      canonicalUrl !==
      cleanFacebookUrl(
        originalUrl
      );


    /*
     * Flag canonical.
     */

    let canonicalFound =
      false;


    /*
     * Jika masih URL /share/,
     * coba ambil HTML Facebook.
     */

    if (
      isFacebookShareUrl(
        canonicalUrl
      )
    ) {

      const htmlResult =
        await fetchFacebookHtml(
          canonicalUrl
        );


      if (
        htmlResult.ok &&
        htmlResult.html
      ) {

        const extracted =
          extractCanonicalFacebookUrl(
            htmlResult.html
          );


        if (
          extracted &&
          !isFacebookShareUrl(
            extracted
          )
        ) {

          canonicalUrl =
            cleanFacebookUrl(
              extracted
            );

          canonicalFound =
            true;

          redirected =
            true;

        }

      }

    }


    /*
     * Kalau redirect menghasilkan URL Facebook
     * tetapi masih berupa URL aneh,
     * coba satu kali lagi mengambil HTML.
     */

    if (
      isFacebookUrl(canonicalUrl) &&
      !canonicalFound &&
      !isFacebookShareUrl(canonicalUrl)
    ) {

      const htmlResult =
        await fetchFacebookHtml(
          canonicalUrl
        );


      if (
        htmlResult.ok &&
        htmlResult.html
      ) {

        const extracted =
          extractCanonicalFacebookUrl(
            htmlResult.html
          );


        if (
          extracted &&
          !isFacebookShareUrl(
            extracted
          )
        ) {

          canonicalUrl =
            cleanFacebookUrl(
              extracted
            );

          canonicalFound =
            true;

        }

      }

    }


    /*
     * Tentukan tipe media.
     */

    const mediaType =
      detectFacebookType(
        canonicalUrl
      );


    /*
     * Tentukan status resolver.
     */

    let reason =
      "resolved";


    if (
      isFacebookShareUrl(
        canonicalUrl
      )
    ) {

      reason =
        "facebook_share_url_could_not_be_resolved";

    } else if (
      canonicalFound
    ) {

      reason =
        "canonical_url_found";

    } else if (
      redirected
    ) {

      reason =
        "redirect_resolved";

    }


    /*
     * Response.
     */

    return response(
      200,
      {
        ok: true,

        originalUrl:
          originalUrl,

        resolvedUrl:
          canonicalUrl,

        mediaType:
          mediaType,

        isShareUrl:
          isShareUrl,

        redirected:
          redirected,

        canonicalFound:
          canonicalFound,

        reason:
          reason,

        redirectChain:
          resolved.redirectChain || [],

        lastStatus:
          resolved.lastStatus || null

      },
      headers
    );


  } catch (error) {

    return response(
      500,
      {
        ok: false,

        error:
          error &&
          error.message
            ? error.message
            : "Gagal resolve Facebook URL."
      },
      headers
    );

  }

};


/*
 * =========================================================
 * RESPONSE HELPER
 * =========================================================
 */

function response(
  statusCode,
  data,
  headers
) {

  return {
    statusCode,
    headers,
    body:
      JSON.stringify(
        data
      )
  };

}


/*
 * =========================================================
 * RESOLVE FACEBOOK REDIRECT
 * =========================================================
 */

async function resolveFacebookUrl(url) {

  let currentUrl =
    url;

  let lastUrl =
    url;

  const redirectChain =
    [];

  let lastStatus =
    null;


  /*
   * Maksimal 8 redirect.
   */

  for (
    let i = 0;
    i < 8;
    i++
  ) {

    const controller =
      new AbortController();


    const timer =
      setTimeout(
        function() {

          controller.abort();

        },
        12000
      );


    try {

      const result =
        await fetch(
          currentUrl,
          {
            method: "GET",

            redirect: "manual",

            signal:
              controller.signal,

            headers: {

              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

              "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

              "Accept-Language":
                "en-US,en;q=0.9",

              "Cache-Control":
                "no-cache",

              "Pragma":
                "no-cache"

            }

          }
        );


      clearTimeout(
        timer
      );


      lastStatus =
        result.status;


      lastUrl =
        currentUrl;


      /*
       * Simpan chain.
       */

      redirectChain.push({

        url:
          currentUrl,

        status:
          result.status

      });


      /*
       * Ambil Location.
       */

      const location =
        result.headers.get(
          "location"
        );


      /*
       * Kalau Facebook mengirim redirect.
       */

      if (
        location
      ) {

        let nextUrl;

        try {

          nextUrl =
            new URL(
              location,
              currentUrl
            ).toString();

        } catch (error) {

          return {
            finalUrl:
              currentUrl,

            redirectChain:
              redirectChain,

            lastStatus:
              lastStatus
          };

        }


        /*
         * Kalau URL berikutnya Facebook,
         * lanjutkan resolve.
         */

        if (
          isFacebookUrl(
            nextUrl
          )
        ) {

          currentUrl =
            nextUrl;

          continue;

        }


        /*
         * Kalau redirect keluar Facebook,
         * tetap kembalikan hasilnya.
         */

        return {

          finalUrl:
            nextUrl,

          redirectChain:
            redirectChain,

          lastStatus:
            lastStatus

        };

      }


      /*
       * Tidak ada Location.
       *
       * Ambil URL final dari response.
       */

      const finalResponseUrl =
        result.url ||
        currentUrl;


      return {

        finalUrl:
          finalResponseUrl,

        redirectChain:
          redirectChain,

        lastStatus:
          lastStatus

      };


    } catch (error) {

      clearTimeout(
        timer
      );


      /*
       * Jangan membuat function gagal total
       * hanya karena Facebook menolak request.
       */

      return {

        finalUrl:
          lastUrl,

        redirectChain:
          redirectChain,

        lastStatus:
          lastStatus,

        error:
          error &&
          error.message
            ? error.message
            : "Redirect request gagal."

      };

    }

  }


  /*
   * Maksimal redirect tercapai.
   */

  return {

    finalUrl:
      lastUrl,

    redirectChain:
      redirectChain,

    lastStatus:
      lastStatus

  };

}


/*
 * =========================================================
 * FETCH HTML FACEBOOK
 * =========================================================
 */

async function fetchFacebookHtml(url) {

  const controller =
    new AbortController();


  const timer =
    setTimeout(
      function() {

        controller.abort();

      },
      12000
    );


  try {

    const result =
      await fetch(
        url,
        {
          method: "GET",

          redirect: "follow",

          signal:
            controller.signal,

          headers: {

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

            "Accept-Language":
              "en-US,en;q=0.9",

            "Cache-Control":
              "no-cache",

            "Pragma":
              "no-cache"

          }

        }
      );


    clearTimeout(
      timer
    );


    if (
      !result.ok
    ) {

      return {

        ok:
          false,

        status:
          result.status,

        html:
          "",

        finalUrl:
          result.url || url

      };

    }


    const text =
      await result.text();


    return {

      ok:
        true,

      status:
        result.status,

      html:
        text.substring(
          0,
          4000000
        ),

      finalUrl:
        result.url || url

    };


  } catch (error) {

    clearTimeout(
      timer
    );


    return {

      ok:
        false,

      status:
        null,

      html:
        "",

      finalUrl:
        url,

      error:
        error &&
        error.message
          ? error.message
          : "Gagal mengambil HTML Facebook."

    };

  }

}


/*
 * =========================================================
 * CARI CANONICAL FACEBOOK URL
 * =========================================================
 */

function extractCanonicalFacebookUrl(
  html
) {

  if (
    !html
  ) {

    return "";

  }


  /*
   * Pola HTML standar.
   */

  const patterns = [

    /*
     * <link rel="canonical" href="...">
     */

    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,


    /*
     * <link href="..." rel="canonical">
     */

    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,


    /*
     * og:url
     */

    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,


    /*
     * og:url dengan urutan attribute berbeda.
     */

    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,


    /*
     * twitter:url
     */

    /<meta[^>]+property=["']twitter:url["'][^>]+content=["']([^"']+)["']/i,


    /*
     * twitter:url urutan berbeda.
     */

    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:url["']/i

  ];


  /*
   * Coba semua pola.
   */

  for (
    const pattern of patterns
  ) {

    const match =
      html.match(
        pattern
      );


    if (
      match &&
      match[1]
    ) {

      const candidate =
        normalizeExtractedUrl(
          match[1]
        );


      if (
        candidate &&
        isFacebookUrl(
          candidate
        ) &&
        !isFacebookShareUrl(
          candidate
        )
      ) {

        return candidate;

      }

    }

  }


  /*
   * Beberapa halaman Facebook menyimpan
   * URL dalam JSON dengan escaped slash.
   */

  const jsonPatterns = [

    /"og:url"\s*:\s*"([^"]+)"/i,

    /"canonical"\s*:\s*"([^"]+)"/i,

    /"url"\s*:\s*"(https?:\\\/\\\/(?:www\.)?facebook\.com[^"]+)"/i,

    /(https?:\\\/\\\/(?:www\.)?facebook\.com\\\/(?:reel|watch|videos|video)\\\/[^"\\]+)/i

  ];


  for (
    const pattern of jsonPatterns
  ) {

    const match =
      html.match(
        pattern
      );


    if (
      match &&
      match[1]
    ) {

      const candidate =
        normalizeExtractedUrl(
          match[1]
        );


      if (
        candidate &&
        isFacebookUrl(
          candidate
        ) &&
        !isFacebookShareUrl(
          candidate
        )
      ) {

        return candidate;

      }

    }

  }


  return "";

}


/*
 * =========================================================
 * NORMALIZE URL HASIL EXTRACTION
 * =========================================================
 */

function normalizeExtractedUrl(
  value
) {

  if (
    !value
  ) {

    return "";

  }


  let result =
    String(value).trim();


  /*
   * Decode HTML entity.
   */

  result =
    decodeHtmlEntities(
      result
    );


  /*
   * Decode escaped JSON slash.
   */

  result =
    result
      .replace(
        /\\\//g,
        "/"
      )
      .replace(
        /\\"/g,
        '"'
      );


  /*
   * Kadang URL dibungkus quote.
   */

  result =
    result.replace(
      /^["']+|["']+$/g,
      ""
    );


  /*
   * Kalau relative URL.
   */

  if (
    result.startsWith("/")
  ) {

    result =
      "https://www.facebook.com" +
      result;

  }


  return result;

}


/*
 * =========================================================
 * CLEAN FACEBOOK URL
 * =========================================================
 */

function cleanFacebookUrl(
  url
) {

  try {

    const parsed =
      new URL(
        url
      );


    /*
     * Hapus hash.
     */

    parsed.hash =
      "";


    /*
     * Parameter tracking.
     */

    const removeParams = [

      "fbclid",

      "__cft__",

      "__tn__",

      "ref",

      "refsrc",

      "hc_location",

      "mibextid",

      "paipv",

      "idorvanity",

      "notif_id",

      "notif_t"

    ];


    removeParams.forEach(
      function(param) {

        parsed.searchParams.delete(
          param
        );

      }
    );


    return parsed.toString();

  } catch (error) {

    return url;

  }

}


/*
 * =========================================================
 * CEK FACEBOOK URL
 * =========================================================
 */

function isFacebookUrl(
  url
) {

  try {

    const parsed =
      new URL(
        url
      );


    const host =
      parsed.hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    return (

      host ===
        "facebook.com"

      ||

      host.endsWith(
        ".facebook.com"
      )

      ||

      host ===
        "fb.com"

      ||

      host.endsWith(
        ".fb.com"
      )

      ||

      host ===
        "fb.watch"

    );

  } catch (error) {

    return false;

  }

}


/*
 * =========================================================
 * CEK SHARE URL
 * =========================================================
 */

function isFacebookShareUrl(
  url
) {

  try {

    const parsed =
      new URL(
        url
      );


    return (
      /\/share\/(r|v)\//i.test(
        parsed.pathname
      )
    );

  } catch (error) {

    return false;

  }

}


/*
 * =========================================================
 * DETEKSI TIPE FACEBOOK
 * =========================================================
 */

function detectFacebookType(
  url
) {

  const lower =
    String(url)
      .toLowerCase();


  /*
   * Facebook Reel.
   */

  if (
    lower.includes(
      "/reel/"
    )
  ) {

    return "reel";

  }


  /*
   * Facebook Watch.
   */

  if (
    lower.includes(
      "/watch"
    )
  ) {

    return "watch";

  }


  /*
   * Facebook Videos.
   */

  if (
    lower.includes(
      "/videos/"
    )
  ) {

    return "video";

  }


  /*
   * Facebook Video.
   */

  if (
    lower.includes(
      "/video/"
    )
  ) {

    return "video";

  }


  /*
   * URL Share yang belum berhasil
   * di-resolve.
   */

  if (
    lower.includes(
      "/share/"
    )
  ) {

    return "share";

  }


  return "facebook";

}


/*
 * =========================================================
 * DECODE HTML ENTITIES
 * =========================================================
 */

function decodeHtmlEntities(
  str
) {

  return String(str)

    .replace(
      /&amp;/gi,
      "&"
    )

    .replace(
      /&quot;/gi,
      '"'
    )

    .replace(
      /&#39;/gi,
      "'"
    )

    .replace(
      /&#x27;/gi,
      "'"
    )

    .replace(
      /&lt;/gi,
      "<"
    )

    .replace(
      /&gt;/gi,
      ">"
    )

    .replace(
      /&#x2F;/gi,
      "/"
    )

    .replace(
      /&#47;/gi,
      "/"
    );

}
