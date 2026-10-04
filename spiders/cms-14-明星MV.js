// @name 🎶明星┃MV
// @version 1.0.2
// @downloadURL https://raw.githubusercontent.com/wenjie654654954-afk/omnibox-sites/main/spiders/cms-14-明星MV.js
// @dependencies axios

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

const SITE_API = "https://mv.wogg.link/mv/vod";

async function requestApi(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  const sep = SITE_API.includes("?") ? "&" : "?";
  const url = `${SITE_API}${sep}${qs}`;
  const res = await OmniBox.request(url, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
  return JSON.parse(res.body || "{}");
}

function mapVod(v) {
  return {
    vod_id: String(v.vod_id || ""),
    vod_name: String(v.vod_name || ""),
    vod_pic: String(v.vod_pic || ""),
    type_id: String(v.type_id || ""),
    type_name: String(v.type_name || ""),
    vod_remarks: String(v.vod_remarks || ""),
    vod_year: String(v.vod_year || ""),
  };
}

/**
 * 列表接口的 vod_pic 经常为空，用一次批量详情把封面补上。
 */
async function fillPics(list) {
  try {
    const ids = list.map(v => v.vod_id).filter(Boolean);
    if (!ids.length) return list;
    const data = await requestApi({ ac: "detail", ids: ids.join(",") });
    const picMap = {};
    for (const v of (data.list || [])) {
      const id = String(v.vod_id || "");
      if (id && v.vod_pic) picMap[id] = String(v.vod_pic);
    }
    for (const v of list) {
      if (!v.vod_pic && picMap[v.vod_id]) v.vod_pic = picMap[v.vod_id];
    }
  } catch (e) { /* 封面补不上就空着，不影响主流程 */ }
  return list;
}

async function home(params, context) {
  try {
    const data = await requestApi({ ac: "list", pg: "1" });
    const list = (data.list || []).map(mapVod);
    await fillPics(list);
    return {
      class: (data.class || []).map(c => ({ type_id: String(c.type_id), type_name: String(c.type_name) })),
      list,
    };
  } catch (e) {
    return { class: [], list: [] };
  }
}

async function category(params, context) {
  try {
    const { categoryId = "1", page = 1 } = params;
    const data = await requestApi({ ac: "videolist", t: categoryId, pg: String(page) });
    const list = (data.list || []).map(mapVod);
    await fillPics(list);
    return {
      page: Number(data.page) || page,
      pagecount: Number(data.pagecount) || 0,
      total: Number(data.total) || 0,
      list,
    };
  } catch (e) {
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function detail(params, context) {
  try {
    const { videoId } = params;
    if (!videoId) return { list: [] };
    const data = await requestApi({ ac: "detail", ids: videoId });
    const list = (data.list || []).map(v => {
      const episodes = [];
      if (v.vod_play_url) {
        v.vod_play_url.split("#").forEach((seg, i) => {
          const parts = seg.trim().split("$");
          episodes.push(parts.length >= 2
            ? { name: parts[0].trim(), playId: parts.slice(1).join("$").trim() }
            : { name: `第${i + 1}集`, playId: parts[0].trim() });
        });
      }
      return {
        ...mapVod(v),
        vod_content: String(v.vod_content || ""),
        vod_actor: String(v.vod_actor || ""),
        vod_director: String(v.vod_director || ""),
        vod_play_sources: episodes.length > 0 ? [{ name: "线路1", episodes }] : undefined,
      };
    });
    return { list };
  } catch (e) {
    return { list: [] };
  }
}

async function search(params, context) {
  try {
    const keyword = params.keyword || params.wd || "";
    const page = params.page || 1;
    if (!keyword) return { page: 1, pagecount: 0, total: 0, list: [] };
    const data = await requestApi({ ac: "list", wd: keyword, pg: String(page) });
    const list = (data.list || []).map(mapVod);
    await fillPics(list);
    return {
      page: Number(data.page) || page,
      pagecount: Number(data.pagecount) || 0,
      total: Number(data.total) || 0,
      list,
    };
  } catch (e) {
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function play(params, context) {
  try {
    const { playId, flag = "play" } = params;
    if (!playId) throw new Error("playId 为空");

    // 1) 已经是直链
    if (/\.(m3u8|mp4)(\?|$)/i.test(playId)) {
      return { urls: [{ name: "播放", url: playId }], flag, header: {}, parse: 0 };
    }

    // 2) share 中转页：抓 HTML 提取真 m3u8
    if (/^https?:\/\//i.test(playId)) {
      try {
        const res = await OmniBox.request(playId, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": SITE_API,
          },
        });
        const html = res.body || "";
        const m = html.match(/var\s+main\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i)
               || html.match(/["'](?:url|src|videoUrl)["']\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i)
               || html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i)
               || html.match(/(\/[^"'\s]+\.m3u8[^"'\s]*)/i);
        if (m) {
          let realUrl = m[1] || m[0];
          if (realUrl.startsWith("/")) {
            try { realUrl = new URL(playId).origin + realUrl; } catch (e) {}
          }
          await OmniBox.log("info", `[play] 解析到直链: ${realUrl.slice(0, 80)}`);
          return { urls: [{ name: "播放", url: realUrl }], flag, header: {}, parse: 0 };
        }
        await OmniBox.log("warn", "[play] share 页未提取到 m3u8，走解析");
      } catch (e) {
        await OmniBox.log("warn", `[play] share 页抓取失败: ${e.message}，走解析`);
      }
    }

    // 3) 兜底：交给解析资源
    return { urls: [{ name: "播放", url: playId }], flag, header: {}, parse: 1 };
  } catch (e) {
    return { url: "", flag: params.flag || "play", header: {} };
  }
}
