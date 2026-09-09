exports.handler = async function(event) {

  if(
    event.httpMethod &&
    event.httpMethod !== "GET"
  ){

    return {
      statusCode:405,
      headers:{
        "Access-Control-Allow-Origin":"*",
        "Allow":"GET"
      },
      body:JSON.stringify({
        ok:false,
        error:"Method tidak diizinkan."
      })
    };

  }

  const params =
    event.queryStringParameters || {};

  const target =
    params.url;

  const headers = {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"Content-Type",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  };

  if(!target){

    return {
      statusCode:400,
      headers,
      body:JSON.stringify({
        ok:false,
        error:"Parameter URL playlist tidak ditemukan."
      })
    };

  }

  let parsed;

  try{

    parsed =
      new URL(target);

  }catch{

    return {
      statusCode:400,
      headers,
      body:JSON.stringify({
        ok:false,
        error:"URL playlist tidak valid."
      })
    };

  }

  if(
    !["http:","https:"].includes(
      parsed.protocol
    )
  ){

    return {
      statusCode:400,
      headers,
      body:JSON.stringify({
        ok:false,
        error:"Playlist harus menggunakan HTTP atau HTTPS."
      })
    };

  }

  const hostname =
    parsed.hostname.toLowerCase();

  const blockedHosts = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1"
  ];

  const privateIpv4 =
    /^(10\.|127\.|169\.254\.|192\.168\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

  if(
    blockedHosts.includes(hostname) ||
    hostname.endsWith(".local") ||
    privateIpv4.test(hostname)
  ){

    return {
      statusCode:403,
      headers,
      body:JSON.stringify({
        ok:false,
        error:"Alamat playlist lokal/private tidak diizinkan."
      })
    };

  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      20000
    );

  try{

    const response =
      await fetch(
        parsed.toString(),
        {
          method:"GET",
          redirect:"follow",
          signal:controller.signal,

          headers:{
            "User-Agent":
              "Nina-Universal-Smart-Video-Player/1.0",

            "Accept":
              "application/vnd.apple.mpegurl, " +
              "application/x-mpegURL, " +
              "audio/mpegurl, " +
              "text/plain, */*"
          }
        }
      );

    clearTimeout(timer);

    if(!response.ok){

      return {
        statusCode:502,
        headers,
        body:JSON.stringify({
          ok:false,
          error:
            `Server playlist mengembalikan HTTP ${response.status}.`
        })
      };

    }

    const contentLength =
      response.headers.get(
        "content-length"
      );

    if(
      contentLength &&
      Number(contentLength) >
      12 * 1024 * 1024
    ){

      return {
        statusCode:413,
        headers,
        body:JSON.stringify({
          ok:false,
          error:
            "Playlist terlalu besar. Maksimal 12 MB."
        })
      };

    }

    const text =
      await response.text();

    if(
      text.length >
      12 * 1024 * 1024
    ){

      return {
        statusCode:413,
        headers,
        body:JSON.stringify({
          ok:false,
          error:
            "Playlist terlalu besar. Maksimal 12 MB."
        })
      };

    }

    const validM3U =
      text.includes("#EXTM3U") ||
      text.includes("#EXTINF");

    if(!validM3U){

      return {
        statusCode:422,
        headers,
        body:JSON.stringify({
          ok:false,
          error:
            "Response bukan playlist M3U yang valid."
        })
      };

    }

    return {
      statusCode:200,
      headers,
      body:JSON.stringify({

        ok:true,

        playlistUrl:
          response.url ||
          parsed.toString(),

        text

      })
    };

  }catch(error){

    clearTimeout(timer);

    console.error(
      "M3U Function Error:",
      error
    );

    return {
      statusCode:502,
      headers,
      body:JSON.stringify({
        ok:false,
        error:
          error.name === "AbortError"
            ? "Timeout mengambil playlist."
            : (
                error.message ||
                "Gagal mengambil playlist."
              )
      })
    };

  }

};
