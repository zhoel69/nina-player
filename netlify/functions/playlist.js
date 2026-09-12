/*
 * Nina Universal Smart Video Player
 * Netlify Function: playlist.js
 *
 * STABLE + VERIFIED DELETE VERSION
 *
 * FIX:
 * - GET menggunakan pagination
 * - GET batch bertahap
 * - POST menggunakan batch
 * - POST retry otomatis
 * - GET retry otomatis
 * - PUT retry otomatis
 * - DELETE retry otomatis
 * - DELETE satu channel diverifikasi setelah penghapusan
 * - DELETE GROUP berdasarkan source_group
 * - DELETE ALL tetap aman untuk data besar
 * - Response kosong tidak dipaksa JSON.parse()
 * - Semua response Netlify selalu JSON valid
 * - Duplicate ID dicegah
 * - ID kosong dibuat otomatis
 * - Cocok untuk playlist besar / ribuan channel
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
 * Ukuran halaman GET.
 *
 * Jangan terlalu besar karena response
 * bisa menjadi berat.
 */
const GET_BATCH_SIZE =
  300;


/*
 * Jumlah halaman GET yang diproses
 * secara bersamaan.
 *
 * Dibuat kecil supaya Supabase
 * tidak dibanjiri request.
 */
const GET_CONCURRENCY =
  3;


/*
 * Jumlah retry maksimal.
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
 * Batas body POST.
 *
 * Ini bukan pengganti limit Netlify,
 * tetapi mencegah request yang terlalu
 * besar diproses oleh Function.
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
 * SAFE JSON
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
 * MAP DATABASE -> PLAYER
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
 * MAP PLAYER -> DATABASE
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
 * Retry untuk:
 * 408
 * 429
 * 500
 * 502
 * 503
 * 504
 *
 * Juga retry network error.
 * ================================================== */

async function supabaseFetch(
  url,
  options = {},
  retryCount = 0
){

  try{

    const response =
      await fetch(
        url,
        options
      );


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


    throw new Error(
      `Supabase HTTP ${response.status}: ${
        text ||
        "response kosong"
      }`
    );

  }catch(error){

    /*
     * Network error.
     *
     * Jangan langsung menyerah.
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
 * MAIN
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
     * ENVIRONMENT
     * ================================================== */

    if(
      !SUPABASE_URL ||
      !SUPABASE_KEY
    ){

      return {

        statusCode:
          500,

        headers,

        body:
          JSON.stringify({

            success:
              false,

            error:
              "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia."

          })

      };

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
     * ================================================== */

    if(
      event.httpMethod ===
      "GET"
    ){

      console.log(
        "Nina Playlist GET START"
      );


      let allRows =
        [];


      /*
       * Batch pertama.
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
       * selesai.
       */
      if(
        firstPage.length <
        GET_BATCH_SIZE
      ){

        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify(
              allRows.map(
                mapRow
              )
            )

        };

      }


      /*
       * Batch berikutnya.
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


      /*
       * Hilangkan duplicate ID.
       */
      const uniqueMap =
        new Map();


      for(
        const row of allRows
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


      const videos =
        Array.from(
          uniqueMap.values()
        ).map(
          mapRow
        );


      console.log(
        `Nina GET SELESAI: ${videos.length} records`
      );


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify(
            videos
          )

      };

    }


    /* ==================================================
     * POST
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

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                "Body request bukan JSON yang valid."

            })

        };

      }


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

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                "Tidak ada data video."

            })

        };

      }


      /*
       * Jangan izinkan satu request
       * menjadi terlalu besar.
       */
      if(
        items.length >
        MAX_POST_ITEMS
      ){

        return {

          statusCode:
            413,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                `Maksimal ${MAX_POST_ITEMS} item per proses import.`

            })

        };

      }


      /*
       * Map.
       */
      const mappedRows =
        items.map(
          mapItem
        );


      /*
       * Deduplicate ID.
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
       * POST bertahap.
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
           * Karena return=minimal,
           * response kosong adalah normal.
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


      if(
        errors.length
      ){

        return {

          statusCode:
            500,

          headers,

          body:
            JSON.stringify({

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

            })

        };

      }


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify({

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

          })

      };

    }


    /* ==================================================
     * PUT
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

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                "Body request bukan JSON yang valid."

            })

        };

      }


      if(
        !body ||
        !body.id
      ){

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                "ID video tidak ditemukan."

            })

        };

      }


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


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify({

            success:
              true,

            message:
              "Channel berhasil diperbarui.",

            data:
              Array.isArray(data)
                ? data
                : []

          })

      };

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
        params.id;


      /*
       * ==================================================
       * DELETE ALL
       * ==================================================
       */

      if(
        params.all ===
        "true"
      ){

        console.log(
          "Nina DELETE ALL START"
        );


        const result =
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


        /*
         * Karena return=minimal,
         * response kosong adalah normal.
         */
        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                "all",

              message:
                "Semua channel berhasil dihapus."

            })

        };

      }


      /*
       * ==================================================
       * DELETE GROUP
       *
       * Sinkronisasi dengan HTML terbaru.
       *
       * Bisa dipanggil dengan:
       *
       * ?group=Link%20Manual
       *
       * atau:
       *
       * ?sourceGroup=Link%20Manual
       *
       * Keduanya menggunakan kolom:
       *
       * source_group
       *
       * di Supabase.
       * ==================================================
       */

      const group =
        params.group ||
        params.sourceGroup ||
        "";


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


        /*
         * Hapus seluruh row yang memiliki
         * source_group sesuai nama grup.
         *
         * return=minimal dipakai supaya
         * Supabase tidak mengirim ribuan
         * row kembali ke Netlify.
         */
        const result =
          await supabaseFetch(
            `${SUPABASE_ENDPOINT}?source_group=eq.${encodeURIComponent(groupName)}`,
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


        /*
         * Jika Supabase menerima DELETE
         * tanpa error, operasi dianggap
         * berhasil.
         */
        console.log(
          `Nina DELETE GROUP SELESAI group=${groupName}`
        );


        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                true,

              group:
                groupName,

              message:
                `Grup "${groupName}" berhasil dihapus.`

            })

        };

      }


      /*
       * ==================================================
       * DELETE ONE
       * ==================================================
       */

      if(id){

        console.log(
          `Nina DELETE START id=${id}`
        );


        /*
         * PENTING:
         *
         * return=representation
         *
         * Supabase mengembalikan row
         * yang benar-benar terhapus.
         *
         * Jadi kita bisa memastikan
         * ID tersebut memang hilang.
         */
        const result =
          await supabaseFetch(
            `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(id)}`,
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
         *
         * Ini berarti tidak ada row
         * yang dikembalikan.
         */
        if(
          !result.text ||
          !result.text.trim()
        ){

          return {

            statusCode:
              404,

            headers,

            body:
              JSON.stringify({

                success:
                  false,

                deleted:
                  false,

                error:
                  "Channel tidak ditemukan atau sudah terhapus."

              })

          };

        }


        const deletedRows =
          safeJsonParse(
            result.text
          );


        /*
         * Pastikan benar-benar array.
         */
        if(
          !Array.isArray(
            deletedRows
          )
        ){

          return {

            statusCode:
              500,

            headers,

            body:
              JSON.stringify({

                success:
                  false,

                deleted:
                  false,

                error:
                  "Supabase memberikan response penghapusan yang tidak valid."

              })

          };

        }


        /*
         * Tidak ada row yang terhapus.
         */
        if(
          deletedRows.length === 0
        ){

          return {

            statusCode:
              404,

            headers,

            body:
              JSON.stringify({

                success:
                  false,

                deleted:
                  false,

                error:
                  "Channel tidak ditemukan atau sudah terhapus."

              })

          };

        }


        /*
         * Cari ID yang benar-benar dihapus.
         */
        const confirmed =
          deletedRows.some(
            row =>
              String(row.id) ===
              String(id)
          );


        if(!confirmed){

          return {

            statusCode:
              500,

            headers,

            body:
              JSON.stringify({

                success:
                  false,

                deleted:
                  false,

                error:
                  "Penghapusan belum dapat dikonfirmasi."

              })

          };

        }


        console.log(
          `Nina DELETE SELESAI id=${id}`
        );


        /*
         * BARU DI SINI kita bilang sukses.
         */
        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                true,

              id:
                id,

              message:
                "Channel berhasil dihapus."

            })

        };

      }


      /*
       * DELETE tanpa parameter.
       */
      return {

        statusCode:
          400,

        headers,

        body:
          JSON.stringify({

            success:
              false,

            deleted:
              false,

            error:
              "Gunakan ?id=..., ?group=..., ?sourceGroup=... atau ?all=true"

          })

      };

    }


    /* ==================================================
     * METHOD TIDAK DIDUKUNG
     * ================================================== */

    return {

      statusCode:
        405,

      headers,

      body:
        JSON.stringify({

          success:
            false,

          error:
            "Method tidak didukung."

        })

    };

  }catch(error){

    console.error(
      "Nina Playlist Error:",
      error
    );


    /*
     * SEMUA ERROR tetap dikembalikan
     * sebagai JSON valid.
     */
    return {

      statusCode:
        500,

      headers,

      body:
        JSON.stringify({

          success:
            false,

          error:
            error.message ||
            "Terjadi kesalahan server."

        })

    };

  }

};
