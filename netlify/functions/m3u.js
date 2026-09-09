exports.handler = async function(event) {
  try {
    const url = event.queryStringParameters?.url;

    if (!url) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          error: "Parameter URL M3U belum diberikan."
        })
      };
    }

    let target;

    try {
      target = new URL(url);
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          error: "URL M3U tidak valid."
        })
      };
    }

    if (!["http:", "https:"].includes(target.protocol)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          error: "URL hanya boleh menggunakan HTTP atau HTTPS."
        })
      };
    }

    const hostname = target.hostname.toLowerCase();

    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1"
    ];

    if (
      blockedHosts.includes(hostname) ||
      hostname.endsWith(".local")
    ) {
      return {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          error: "Host tersebut tidak diperbolehkan."
        })
      };
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 20000);

    let response;

    try {
      response = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Nina Universal Smart Video Player/1.0",
          "Accept": "*/*"
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          error: `Playlist gagal diambil. HTTP ${response.status}`
        })
      };
    }

    const text = await response.text();

    if (!text || text.trim().length === 0) {
      return {
        statusCode: 422,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          error: "Playlist kosong."
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: true,
        sourceUrl: url,
        finalUrl: response.url || url,
        text: text
      })
    };

  } catch (error) {

    console.error("M3U FUNCTION ERROR:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        error: error.name === "AbortError"
          ? "Playlist terlalu lama merespons."
          : (error.message || "Gagal mengambil playlist M3U.")
      })
    };
  }
};
