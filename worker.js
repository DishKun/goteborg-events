/**
 * Cloudflare Worker - 哥德堡活动代理
 * 部署到: plain-meadow-437c.dishkun2012.workers.dev
 * 
 * 路由:
 *   /api/kompis        -> 代理 kompissverige.se 活动列表
 *   /api/kompis-detail?slug=xxx -> 代理 kompissverige.se 活动详情
 *   /api/gbg?date=YYYY-MM-DD&page=N -> 代理 goteborg.se 活动日历
 *   /api/gbg?search=opal&page=N    -> 代理 goteborg.se 活动日历搜索(不限制日期)
 *   /api/abf?type=course|event&page=N -> 代理 abf.se 课程/活动搜索
 *   /api/abf-detail?slug=xxx -> 代理 abf.se 活动/课程详情页
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

const UA = 'Mozilla/5.0 (compatible; GoteborgEventsBot/1.0)';

function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function addCors(response) {
  const newHeaders = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

async function proxyUrl(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  return addCors(resp);
}

async function handleKompis() {
  return proxyUrl('https://kompissverige.se/en/activities/');
}

async function handleKompisDetail(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return new Response('Missing slug', { status: 400, headers: CORS_HEADERS });
  return proxyUrl(`https://kompissverige.se/activities/${slug}/`);
}

async function handleGbg(request) {
  const url = new URL(request.url);
  const search = url.searchParams.get('search');
  const page = url.searchParams.get('page') || '0';
  if (search) {
    // 搜索模式：不限制日期，直接传 searchTerm（可选 fromDate/toDate 限定范围）
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');
    let qs = `searchTerm=${encodeURIComponent(search)}&page=${page}`;
    if (fromDate) qs += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) qs += `&toDate=${encodeURIComponent(toDate)}`;
    return proxyUrl(
      `https://goteborg.se/wps/portal/kalendarium/kalendarium-start?${qs}`
    );
  }
  const date = url.searchParams.get('date') || '2026-05-28';
  return proxyUrl(
    `https://goteborg.se/wps/portal/kalendarium/kalendarium-start?fromDate=${date}&toDate=${date}&page=${page}`
  );
}

async function handleAbf(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'course';
  const page = url.searchParams.get('page') || '1';
  
  // ABF uses different type values in query string:
  // "course" for courses, "event" for events
  const abfUrl = `https://www.abf.se/vast/kurs-sok/?type=${encodeURIComponent(type)}&sort=date&display=list&page=${page}`;
  
  const resp = await fetch(abfUrl, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  return addCors(resp);
}

async function handleAbfDetail(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return new Response('Missing slug', { status: 400, headers: CORS_HEADERS });
  return proxyUrl(`https://www.abf.se/vast/kurs/${slug}/`);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return handleOptions();

    try {
      if (path === '/api/kompis-detail') return await handleKompisDetail(request);
      if (path === '/api/kompis') return await handleKompis();
      if (path === '/api/gbg') return await handleGbg(request);
      if (path === '/api/abf-detail') return await handleAbfDetail(request);
      if (path === '/api/abf') return await handleAbf(request);
      
      // Fallback: proxy the original site
      return proxyUrl(request.url);
    } catch (e) {
      return new Response(`Proxy error: ${e.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
};
