/*
 * Nina Universal Smart Video Player
 * Netlify Function: playlist.js
 *
 * SYNCHRONIZED VERSION
 *
 * Sinkron dengan HTML terbaru:
 *
 * - GET playlist dengan pagination
 * - GET batch bertahap
 * - POST menggunakan batch
 * - POST retry otomatis
 * - GET retry otomatis
 * - PUT retry otomatis
 * - DELETE retry otomatis
 * - DELETE satu item berdasarkan id
 * - DELETE GROUP berdasarkan source_group
 * - DELETE YouTube berdasarkan channel_id
 * - DELETE ALL tetap tersedia sebagai fallback
 * - Response kosong aman
 * - Semua response Netlify selalu JSON valid
 * - Duplicate ID dicegah
 * - ID kosong dibuat otomatis
 * - Mendukung:
 *      YouTube
 *      IPTV
 *      Manual Link
 * - Cocok untuk playlist besar / ribuan item
 */


/* ==================================================
 * ENVIRONMENT
 * ================================================== */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE =
  "nina_playlist";

const SUPABASE_ENDPOINT =
  `${SUPABASE_URL}/rest/v1/${TABLE}`;


/* ==================================================
 * CONFIG
 * ================================================== */

/*
 * Ukuran batch GET.
 */
const GET_BATCH_SIZE =
  300;


/*
 * Jumlah request GET yang berjalan
 * secara bersamaan.
 */
const GET_CONCURRENCY =
  3;


/*
 * Maksimal retry.
 */
const MAX_RETRY =
  3;


/*
 * Jeda dasar retry.
 */
const RETRY_DELAY =
  800;


/*
 * Ukuran batch POST.
 */
const POST_BATCH_SIZE =
  100;


/*
 * Maksimal item dalam satu request POST.
 */
const MAX_POST_ITEMS =
  5000;


/* ==================================================
 * HEADERS
 * ================================================== */

function supabaseHeaders(extra = {}){

  return {

    "apikey":
      SUPABASE_KEY,

    "Authorization":
      `Bearer ${SUPABASE_KEY}`,

    "Content-Type":
      "application/json",

    ...extra

  };

}


/* ==================================================
 * SLEEP
 * ================================================== */

function sleep(ms){

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* ==================================================
 * GENERATE ID
 * ================================================== */

function generateId(){

  if(
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID ===
      "function"
  ){

    return globalThis.crypto.randomUUID();

  }

  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );

}


/* ==================================================
 * SAFE JSON PARSE
 * ================================================== */

function safeJsonParse(text){

  if(
    text === null ||
    text === undefined
  ){

    return null;

  }

  const value =
    String(text).trim();

  if(!value){

    return null;

  }

  try{

    return JSON.parse(
      value
    );

  }catch{

    return null;

  }

}


/* ==================================================
 * MAP DATABASE -> HTML
 *
 * Supabase snake_case
 *        ↓
 * HTML camelCase
 * ================================================== */

function mapRow(row){

  return {

    id:
      row.id,

    url:
      row.url || "",

    title:
      row.title || "",

    name:
      row.name || "",

    youtubeId:
      row.youtube_id || "",

    thumbnail:
      row.thumbnail || "",

    publishedAt:
      row.published_at || "",


    sourceType:
      row.source_type || "",

    sourceGroup:
      row.source_group || "",

    channelName:
      row.channel_name || "",

    channelId:
      row.channel_id || "",

    channelGroup:
      row.channel_group || "",


    tvgId:
      row.tvg_id || "",

    tvgName:
      row.tvg_name || "",

    tvgLogo:
      row.tvg_logo || "",

    tvgCountry:
      row.tvg_country || "",

    tvgLanguage:
      row.tvg_language || "",

    tvgShift:
      row.tvg_shift || "",


    playlistSource:
      row.playlist_source || "",


    contentType:
      row.content_type || "",

    duration:
      row.duration || "",

    durationSeconds:
      Number(
        row.duration_seconds || 0
      ),


    isLive:
      Boolean(
        row.is_live
      ),


    mediaType:
      row.media_type || "",


    addedAt:
      Number(
        row.added_at || 0
      )

  };

}


/* ==================================================
 * MAP HTML -> DATABASE
 *
 * HTML camelCase
 *        ↓
 * Supabase snake_case
 * ================================================== */

function mapItem(item){

  return {

    id:
      item.id ||
      generateId(),

    url:
      item.url || "",

    title:
      item.title || "",

    name:
      item.name ||
      item.title ||
      "",


    youtube_id:
      item.youtubeId || "",

    thumbnail:
      item.thumbnail || "",

    published_at:
      item.publishedAt || "",


    source_type:
      item.sourceType || "",

    source_group:
      item.sourceGroup || "",

    channel_name:
      item.channelName || "",

    channel_id:
      item.channelId || "",

    channel_group:
      item.channelGroup || "",


    tvg_id:
      item.tvgId || "",

    tvg_name:
      item.tvgName || "",

    tvg_logo:
      item.tvgLogo || "",

    tvg_country:
      item.tvgCountry || "",

    tvg_language:
      item.tvgLanguage || "",

    tvg_shift:
      item.tvgShift || "",


    playlist_source:
      item.playlistSource || "",


    content_type:
      item.contentType || "",

    duration:
      item.duration || "",

    duration_seconds:
      Number(
        item.durationSeconds || 0
      ),


    is_live:
      Boolean(
        item.isLive
      ),


    media_type:
      item.mediaType || "",


    added_at:
      Number(
        item.addedAt ||
        Date.now()
      )

  };

}


/* ==================================================
 * SUPABASE FETCH
 *
 * Retry hanya untuk:
 *
 * 408
 * 429
 * 500
 * 502
 * 503
 * 504
 *
 * Network error juga di-retry.
 *
 * Error 400/401/403/404 dll
 * TIDAK di-retry berulang kali.
 * ================================================== */

async function supabaseFetch(
  url,
  options = {},
  retryCount = 0
){

  let response;

  try{

    response =
      await fetch(
        url,
        options
      );

  }catch(error){

    /*
     * Network error.
     */
    if(
      retryCount <
      MAX_RETRY
    ){

      const delay =
        RETRY_DELAY *
        (
          retryCount + 1
        );

      console.log(
        `Supabase network error. Retry ${retryCount + 1}/${MAX_RETRY} dalam ${delay}ms:`,
        error.message
      );

      await sleep(
        delay
      );

      return supabaseFetch(
        url,
        options,
        retryCount + 1
      );

    }

    throw error;

  }


  const text =
    await response.text();


  /*
   * SUCCESS
   */
  if(
    response.ok
  ){

    return {

      response,

      text

    };

  }


  /*
   * HTTP yang kemungkinan
   * hanya sementara.
   */
  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status === 500 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504;


  if(
    retryable &&
    retryCount <
    MAX_RETRY
  ){

    const delay =
      RETRY_DELAY *
      (
        retryCount + 1
      );

    console.log(
      `Supabase HTTP ${response.status}. Retry ${retryCount + 1}/${MAX_RETRY} dalam ${delay}ms`
    );

    await sleep(
      delay
    );

    return supabaseFetch(
      url,
      options,
      retryCount + 1
    );

  }


  /*
   * Error HTTP final.
   *
   * Jangan dilempar ke catch
   * di atas supaya tidak retry lagi.
   */
  const error =
    new Error(
      `Supabase HTTP ${response.status}: ${
        text ||
        "response kosong"
      }`
    );

  error.status =
    response.status;

  error.supabaseResponse =
    text;

  throw error;

}


/* ==================================================
 * GET ONE PAGE
 * ================================================== */

async function getPage(
  offset
){

  const url =
    `${SUPABASE_ENDPOINT}` +
    `?select=*` +
    `&order=added_at.asc,id.asc` +
    `&limit=${GET_BATCH_SIZE}` +
    `&offset=${offset}`;


  console.log(
    `Nina GET offset=${offset}, limit=${GET_BATCH_SIZE}`
  );


  const result =
    await supabaseFetch(
      url,
      {

        method:
          "GET",

        headers:
          supabaseHeaders()

      }
    );


  /*
   * Response kosong.
   */
  if(
    !result.text ||
    !result.text.trim()
  ){

    return [];

  }


  const rows =
    safeJsonParse(
      result.text
    );


  if(
    rows === null
  ){

    throw new Error(
      `Response Supabase GET bukan JSON valid pada offset ${offset}.`
    );

  }


  if(
    !Array.isArray(rows)
  ){

    throw new Error(
      `Response Supabase GET bukan array pada offset ${offset}.`
    );

  }


  return rows;

}


/* ==================================================
 * GET SELURUH PLAYLIST
 * ================================================== */

async function getAllPlaylist(){

  let allRows =
    [];


  /*
   * PAGE PERTAMA
   */
  const firstPage =
    await getPage(
      0
    );


  allRows.push(
    ...firstPage
  );


  /*
   * Jika belum penuh,
   * berarti sudah selesai.
   */
  if(
    firstPage.length <
    GET_BATCH_SIZE
  ){

    return allRows;

  }


  /*
   * PAGE BERIKUTNYA
   */
  let nextOffset =
    GET_BATCH_SIZE;


  while(true){

    const offsets =
      [];


    for(
      let i = 0;
      i < GET_CONCURRENCY;
      i++
    ){

      offsets.push(
        nextOffset +
        (
          i *
          GET_BATCH_SIZE
        )
      );

    }


    console.log(
      "Nina GET wave:",
      offsets
    );


    const pages =
      await Promise.all(
        offsets.map(
          getPage
        )
      );


    let finished =
      false;


    for(
      const page of pages
    ){

      allRows.push(
        ...page
      );


      if(
        page.length <
        GET_BATCH_SIZE
      ){

        finished =
          true;

      }

    }


    if(
      finished
    ){

      break;

    }


    nextOffset +=
      GET_CONCURRENCY *
      GET_BATCH_SIZE;

  }


  return allRows;

}


/* ==================================================
 * REMOVE DUPLICATE ROW
 * ================================================== */

function uniqueRowsById(
  rows
){

  const uniqueMap =
    new Map();


  for(
    const row of rows
  ){

    if(
      row &&
      row.id
    ){

      uniqueMap.set(
        String(row.id),
        row
      );

    }

  }


  return Array.from(
    uniqueMap.values()
  );

}


/* ==================================================
 * JSON RESPONSE
 * ================================================== */

function jsonResponse(
  statusCode,
  headers,
  data
){

  return {

    statusCode,

    headers,

    body:
      JSON.stringify(
        data
      )

  };

}


/* ==================================================
 * MAIN HANDLER
 * ================================================== */

exports.handler =
  async function(event){

  const headers = {

    "Content-Type":
      "application/json; charset=utf-8",

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET,POST,PUT,DELETE,OPTIONS",

    "Cache-Control":
      "no-store"

  };


  try{

    /* ==================================================
     * ENVIRONMENT CHECK
     * ================================================== */

    if(
      !SUPABASE_URL ||
      !SUPABASE_KEY
    ){

      return jsonResponse(
        500,
        headers,
        {

          success:
            false,

          error:
            "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia."

        }
      );

    }


    /* ==================================================
     * OPTIONS
     * ================================================== */

    if(
      event.httpMethod ===
      "OPTIONS"
    ){

      return {

        statusCode:
          204,

        headers,

        body:
          ""

      };

    }


    /* ==================================================
     * GET
     *
     * HTML:
     * fetch("/.netlify/functions/playlist")
     * ================================================== */

    if(
      event.httpMethod ===
      "GET"
    ){

      console.log(
        "Nina Playlist GET START"
      );


      const allRows =
        await getAllPlaylist();


      /*
       * Hilangkan duplicate ID.
       */
      const uniqueRows =
        uniqueRowsById(
          allRows
        );


      /*
       * Database -> HTML
       */
      const videos =
        uniqueRows.map(
          mapRow
        );


      console.log(
        `Nina GET SELESAI: ${videos.length} records`
      );


      return jsonResponse(
        200,
        headers,
        videos
      );

    }


    /* ==================================================
     * POST
     *
     * HTML:
     * fetch("/.netlify/functions/playlist", {
     *   method:"POST"
     * })
     *
     * Bisa menerima:
     *
     * [
     *   {...},
     *   {...}
     * ]
     *
     * atau:
     *
     * {
     *   videos:[...]
     * }
     *
     * atau:
     *
     * {
     *   id: "...",
     *   ...
     * }
     * ================================================== */

    if(
      event.httpMethod ===
      "POST"
    ){

      let body;


      try{

        body =
          event.body
            ? JSON.parse(
                event.body
              )
            : null;

      }catch{

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "Body request bukan JSON yang valid."

          }
        );

      }


      /*
       * Normalisasi input.
       */
      const items =
        Array.isArray(body)

          ? body

          : Array.isArray(
              body?.videos
            )

            ? body.videos

            : body
              ? [body]
              : [];


      if(
        !items.length
      ){

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "Tidak ada data video."

          }
        );

      }


      /*
       * Batas jumlah item.
       */
      if(
        items.length >
        MAX_POST_ITEMS
      ){

        return jsonResponse(
          413,
          headers,
          {

            success:
              false,

            error:
              `Maksimal ${MAX_POST_ITEMS} item per proses import.`

          }
        );

      }


      /*
       * HTML -> Database.
       */
      const mappedRows =
        items.map(
          mapItem
        );


      /*
       * Pastikan setiap ID unik.
       */
      const uniqueMap =
        new Map();


      for(
        const row of mappedRows
      ){

        let id =
          String(
            row.id ||
            ""
          ).trim();


        if(!id){

          id =
            generateId();

        }


        row.id =
          id;


        uniqueMap.set(
          id,
          row
        );

      }


      const rows =
        Array.from(
          uniqueMap.values()
        );


      const duplicateRemoved =
        items.length -
        rows.length;


      let savedCount =
        0;


      const errors =
        [];


      /*
       * POST per batch.
       */
      for(
        let i = 0;
        i < rows.length;
        i += POST_BATCH_SIZE
      ){

        const batch =
          rows.slice(
            i,
            i + POST_BATCH_SIZE
          );


        const batchNumber =
          Math.floor(
            i /
            POST_BATCH_SIZE
          ) + 1;


        console.log(
          `Nina POST batch ${batchNumber}: ${batch.length}`
        );


        try{

          await supabaseFetch(
            SUPABASE_ENDPOINT,
            {

              method:
                "POST",

              headers:
                supabaseHeaders({

                  "Prefer":
                    "resolution=merge-duplicates,return=minimal"

                }),

              body:
                JSON.stringify(
                  batch
                )

            }
          );


          /*
           * return=minimal memang
           * boleh memberikan response kosong.
           */
          savedCount +=
            batch.length;

        }catch(error){

          console.error(
            `Nina POST batch ${batchNumber} gagal:`,
            error
          );


          errors.push({

            batch:
              batchNumber,

            count:
              batch.length,

            error:
              error.message

          });

        }

      }


      /*
       * Ada batch gagal.
       */
      if(
        errors.length
      ){

        return jsonResponse(
          500,
          headers,
          {

            success:
              false,

            count:
              savedCount,

            total:
              rows.length,

            duplicateRemoved:
              duplicateRemoved,

            message:
              "Sebagian playlist berhasil disimpan, tetapi ada batch yang gagal.",

            errors:
              errors

          }
        );

      }


      /*
       * SEMUA BERHASIL.
       */
      return jsonResponse(
        200,
        headers,
        {

          success:
            true,

          count:
            savedCount,

          total:
            rows.length,

          duplicateRemoved:
            duplicateRemoved,

          message:
            "Playlist berhasil disimpan."

        }
      );

    }


    /* ==================================================
     * PUT
     *
     * HTML:
     * fetch("/.netlify/functions/playlist", {
     *   method:"PUT"
     * })
     * ================================================== */

    if(
      event.httpMethod ===
      "PUT"
    ){

      let body;


      try{

        body =
          event.body
            ? JSON.parse(
                event.body
              )
            : null;

      }catch{

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "Body request bukan JSON yang valid."

          }
        );

      }


      if(
        !body ||
        !body.id
      ){

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "ID video tidak ditemukan."

          }
        );

      }


      /*
       * HTML -> Database.
       */
      const row = {

        url:
          body.url || "",

        title:
          body.title || "",

        name:
          body.name ||
          body.title ||
          "",


        youtube_id:
          body.youtubeId || "",

        thumbnail:
          body.thumbnail || "",

        published_at:
          body.publishedAt || "",


        source_type:
          body.sourceType || "",

        source_group:
          body.sourceGroup || "",

        channel_name:
          body.channelName || "",

        channel_id:
          body.channelId || "",

        channel_group:
          body.channelGroup || "",


        tvg_id:
          body.tvgId || "",

        tvg_name:
          body.tvgName || "",

        tvg_logo:
          body.tvgLogo || "",

        tvg_country:
          body.tvgCountry || "",

        tvg_language:
          body.tvgLanguage || "",

        tvg_shift:
          body.tvgShift || "",


        playlist_source:
          body.playlistSource || "",


        content_type:
          body.contentType || "",

        duration:
          body.duration || "",

        duration_seconds:
          Number(
            body.durationSeconds || 0
          ),


        is_live:
          Boolean(
            body.isLive
          ),


        media_type:
          body.mediaType || "",


        added_at:
          Number(
            body.addedAt ||
            Date.now()
          )

      };


      const result =
        await supabaseFetch(
          `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(body.id)}`,
          {

            method:
              "PATCH",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=representation"

              }),

            body:
              JSON.stringify(
                row
              )

          }
        );


      const data =
        safeJsonParse(
          result.text
        );


      /*
       * Pastikan ID memang ada.
       */
      if(
        !Array.isArray(data) ||
        data.length === 0
      ){

        return jsonResponse(
          404,
          headers,
          {

            success:
              false,

            error:
              "Video tidak ditemukan."

          }
        );

      }


      return jsonResponse(
        200,
        headers,
        {

          success:
            true,

          message:
            "Channel berhasil diperbarui.",

          data:
            data

        }
      );

    }


    /* ==================================================
     * DELETE
     * ================================================== */

    if(
      event.httpMethod ===
      "DELETE"
    ){

      const params =
        event.queryStringParameters ||
        {};


      const id =
        params.id || "";


      const group =
        params.group ||
        params.sourceGroup ||
        "";


      const channelId =
        params.channelId ||
        "";


      /* ==================================================
       * DELETE ALL
       *
       * Fallback / kompatibilitas.
       *
       * HTML terbaru tidak lagi menggunakan
       * tombol Hapus Semua IPTV.
       * ================================================== */

      if(
        String(params.all)
          .toLowerCase() ===
        "true"
      ){

        console.log(
          "Nina DELETE ALL START"
        );


        await supabaseFetch(
          `${SUPABASE_ENDPOINT}?id=not.is.null`,
          {

            method:
              "DELETE",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=minimal"

              })

          }
        );


        console.log(
          "Nina DELETE ALL SELESAI"
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              "all",

            message:
              "Semua channel berhasil dihapus."

          }
        );

      }


      /* ==================================================
       * DELETE GROUP
       *
       * Cocok untuk:
       *
       * IPTV
       * Manual Link
       *
       * Endpoint:
       *
       * ?group=NAMA_GROUP
       *
       * atau:
       *
       * ?sourceGroup=NAMA_GROUP
       *
       * ================================================== */

      if(
        String(group).trim()
      ){

        const groupName =
          String(
            group
          ).trim();


        console.log(
          `Nina DELETE GROUP START group=${groupName}`
        );


        const deleteUrl =
          `${SUPABASE_ENDPOINT}` +
          `?source_group=eq.${encodeURIComponent(groupName)}`;


        await supabaseFetch(
          deleteUrl,
          {

            method:
              "DELETE",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=minimal"

              })

          }
        );


        console.log(
          `Nina DELETE GROUP SELESAI group=${groupName}`
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              true,

            group:
              groupName,

            message:
              `Grup "${groupName}" berhasil dihapus.`

          }
        );

      }


      /* ==================================================
       * DELETE YOUTUBE CHANNEL
       *
       * Endpoint:
       *
       * ?channelId=UCxxxxxxxx
       *
       * Hanya menghapus data YouTube
       * dengan channel_id tersebut.
       *
       * ================================================== */

      if(
        String(channelId).trim()
      ){

        const youtubeChannelId =
          String(
            channelId
          ).trim();


        console.log(
          `Nina DELETE YOUTUBE CHANNEL START channelId=${youtubeChannelId}`
        );


        const deleteUrl =
          `${SUPABASE_ENDPOINT}` +
          `?source_type=eq.YouTube` +
          `&channel_id=eq.${encodeURIComponent(youtubeChannelId)}`;


        await supabaseFetch(
          deleteUrl,
          {

            method:
              "DELETE",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=minimal"

              })

          }
        );


        console.log(
          `Nina DELETE YOUTUBE CHANNEL SELESAI channelId=${youtubeChannelId}`
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              true,

            channelId:
              youtubeChannelId,

            sourceType:
              "YouTube",

            message:
              "Channel YouTube berhasil dihapus."

          }
        );

      }


      /* ==================================================
       * DELETE ONE ITEM
       *
       * Endpoint:
       *
       * ?id=xxxxxxxx
       *
       * ================================================== */

      if(
        String(id).trim()
      ){

        const itemId =
          String(
            id
          ).trim();


        console.log(
          `Nina DELETE START id=${itemId}`
        );


        /*
         * return=representation
         *
         * Supabase mengembalikan
         * row yang benar-benar
         * dihapus.
         */
        const result =
          await supabaseFetch(
            `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(itemId)}`,
            {

              method:
                "DELETE",

              headers:
                supabaseHeaders({

                  "Prefer":
                    "return=representation"

                })

            }
          );


        /*
         * Response kosong.
         */
        if(
          !result.text ||
          !result.text.trim()
        ){

          return jsonResponse(
            404,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Item tidak ditemukan atau sudah terhapus."

            }
          );

        }


        const deletedRows =
          safeJsonParse(
            result.text
          );


        /*
         * Response harus array.
         */
        if(
          !Array.isArray(
            deletedRows
          )
        ){

          return jsonResponse(
            500,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Supabase memberikan response penghapusan yang tidak valid."

            }
          );

        }


        /*
         * Tidak ada row.
         */
        if(
          deletedRows.length ===
          0
        ){

          return jsonResponse(
            404,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Item tidak ditemukan atau sudah terhapus."

            }
          );

        }


        /*
         * Pastikan ID benar-benar
         * ada di response delete.
         */
        const confirmed =
          deletedRows.some(
            row =>
              String(
                row.id
              ) ===
              String(
                itemId
              )
          );


        if(!confirmed){

          return jsonResponse(
            500,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Penghapusan belum dapat dikonfirmasi."

            }
          );

        }


        console.log(
          `Nina DELETE SELESAI id=${itemId}`
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              true,

            id:
              itemId,

            message:
              "Item berhasil dihapus."

          }
        );

      }


      /* ==================================================
       * DELETE TANPA PARAMETER
       * ================================================== */

      return jsonResponse(
        400,
        headers,
        {

          success:
            false,

          deleted:
            false,

          error:
            "Gunakan ?id=..., ?group=..., ?sourceGroup=..., ?channelId=... atau ?all=true"

        }
      );

    }


    /* ==================================================
     * METHOD TIDAK DIDUKUNG
     * ================================================== */

    return jsonResponse(
      405,
      headers,
      {

        success:
          false,

        error:
          "Method tidak didukung."

      }
    );


  }catch(error){

    console.error(
      "Nina Playlist Error:",
      error
    );


    /*
     * Semua error tetap JSON.
     */
    return jsonResponse(
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500,
      headers,
      {

        success:
          false,

        error:
          error.message ||
          "Terjadi kesalahan server."

      }
    );

  }

};
