// @name 🌪️暴风影音
// @version 1.0.0
// @downloadURL https://raw.githubusercontent.com/wenjie654654954-afk/omnibox-sites/main/spiders/cms-12-暴风影音.js
// @dependencies axios

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

const SITE_API = "https://app.bfzyapi.com/api.php/provide/vod/";

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

async function home(params, context) {
  try {
    const data = await requestApi({ ac: "list", pg: "1" });
    return {
      class: (data.class || []).map(c => ({ type_id: String(c.type_id), type_name: String(c.type_name) })),
      list: (data.list || []).map(mapVod),
    };
  } catch (e) {
    return { class: [], list: [] };
  }
}

async function category(params, context) {
  try {
    const { categoryId = "1", page = 1 } = params;
    const data = await requestApi({ ac: "videolist", t: categoryId, pg: String(page) });
    return {
      page: Number(data.page) || page,
      pagecount: Number(data.pagecount) || 0,
      total: Number(data.total) || 0,
      list: (data.list || []).map(mapVod),
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
    return {
      page: Number(data.page) || page,
      pagecount: Number(data.pagecount) || 0,
      total: Number(data.total) || 0,
      list: (data.list || []).map(mapVod),
    };
  } catch (e) {
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function play(params, context) {
  try {
    const { playId, flag = "play" } = params;
    if (!playId) throw new Error("playId 为空");
    const parse = /\.(m3u8|mp4)(\?|$)/i.test(playId) ? 0 : 1;
    return { urls: [{ name: "播放", url: playId }], flag, header: {}, parse };
  } catch (e) {
    return { url: "", flag: params.flag || "play", header: {} };
  }
}
