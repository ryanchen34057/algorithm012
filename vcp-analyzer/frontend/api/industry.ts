// Vercel Serverless Function: Fetch industry & business description for all stocks
export const config = { regions: ['hkg1'] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface CompanyInfo {
  industry: string;
  concept: string;
}

// Well-known concept tags for popular stocks
const CONCEPT_TAGS: Record<string, string> = {
  '2330': '晶圓代工', '2454': 'IC 設計', '3443': 'IC 設計', '2379': 'IC 設計',
  '3034': 'AI 伺服器', '2382': 'AI 伺服器', '3017': 'AI 伺服器', '6669': 'AI 伺服器',
  '2345': 'AI 伺服器', '3005': 'AI 伺服器', '2353': 'AI 伺服器', '2383': 'AI 伺服器',
  '3706': 'AI 伺服器', '6085': 'AI 伺服器',
  '2324': 'PCB/IC載板', '2467': 'PCB/IC載板', '2395': 'PCB/IC載板',
  '5274': '矽智財', '3661': '矽智財', '6547': 'ASIC',
  '2303': 'DRAM', '6510': '記憶體 IC',
  '2317': '代工/雲端', '4938': 'iPhone 組裝', '2354': '鴻海集團',
  '3037': 'AI 散熱', '3653': 'AI 散熱', '6285': 'AI 散熱', '3380': 'AI 散熱', '6414': 'AI 散熱',
  '3231': 'AI 機殼', '2441': 'AI 機殼',
  '4915': '高階 PCB', '3189': 'HDI PCB', '8046': '軟板 PCB', '8299': 'PCB',
  '2327': '網通設備', '4904': '光通訊', '2455': '光通訊', '3045': '網通設備', '3044': '網通設備',
  '6488': '低軌衛星', '3376': '低軌衛星', '6231': '低軌衛星',
  '3481': '面板', '6116': 'Mini LED', '6176': 'LED 驅動',
  '2207': '汽車零件', '2227': '輪胎', '6271': '車用面板',
  '2891': '金控', '2881': '金控', '2882': '金控', '2886': '金控',
  '2883': '金控', '2884': '金控', '2885': '金控', '2887': '金控',
  '2890': '金控', '2892': '金控', '5880': '金控',
  '2801': '銀行', '2809': '壽險', '2812': '壽險',
  '2002': '鋼鐵', '2006': '鋼鐵', '2014': '鋼鐵',
  '1301': '塑化', '1303': '塑化', '1326': '塑化', '6505': '塑化',
  '1101': '水泥', '1102': '水泥',
  '1216': '食品', '1227': '食品', '2912': '食品通路',
  '2603': '貨櫃航運', '2609': '貨櫃航運', '2615': '貨櫃航運',
  '2605': '散裝航運', '2634': '航空',
  '4743': '新藥', '6446': 'CDMO', '4142': '基因檢測',
  '6533': '風電', '6244': '太陽能', '6409': '儲能',
  '2208': '國防航太',
  '2049': '機器人', '4506': '減速機', '2308': '工業自動化',
  '3665': '連接器', '2368': '光電/IC',
};

// Classify by TWSE stock code prefix (fallback when API is unavailable)
function classifyByCode(code: string): string {
  const n = parseInt(code.slice(0, 2));
  if (n === 11) return '水泥工業';
  if (n === 12) return '食品工業';
  if (n === 13 || n === 14) return '塑膠工業';
  if (n === 15) return '紡織纖維';
  if (n === 16) return '電機機械';
  if (n === 17) return '電器電纜';
  if (n === 18) return '化學工業';
  if (n === 19) return '生技醫療';
  if (n === 20) return '玻璃陶瓷';
  if (n === 21) return '造紙工業';
  if (n === 22) return '鋼鐵工業';
  if (n === 23) return '電子業';
  if (n === 24) return '電子業';
  if (n === 25) return '建材營造';
  if (n === 26) return '航運業';
  if (n === 27) return '觀光餐旅';
  if (n >= 28 && n <= 29) return '金融保險';
  if (n >= 30 && n <= 58) return '電子業';
  if (n === 59 || n === 95) return '金融保險';
  if (n >= 60 && n <= 68) return '電子業';
  if (n >= 80 && n <= 89) return '電子業';
  if (n === 91) return '其他';
  if (n === 99) return '存託憑證';
  return '其他';
}

// More specific sub-industry for electronics stocks
function classifyElectronics(code: string): string {
  const n = parseInt(code.slice(0, 2));
  if (n === 23) return '半導體業';
  if (n === 24) return '半導體業';
  if (n === 30 || n === 31) return '電腦及週邊';
  if (n === 32 || n === 33) return '光電業';
  if (n === 34 || n === 35) return '通信網路業';
  if (n === 36) return '電子零組件';
  if (n === 37 || n === 38) return '電子通路業';
  if (n === 39 || n === 40) return '資訊服務業';
  if (n >= 41 && n <= 49) return '其他電子業';
  if (n >= 50 && n <= 58) return '其他電子業';
  if (n >= 60 && n <= 68) return '電子零組件';
  if (n >= 80 && n <= 89) return '其他電子業';
  return '電子業';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const result: Record<string, CompanyInfo> = {};
  let apiSuccess = false;

  try {
    // Try TWSE/TPEx APIs first
    const [twse, tpex] = await Promise.allSettled([
      fetchTWSEIndustry(),
      fetchTPExIndustry(),
    ]);

    if (twse.status === 'fulfilled' && Object.keys(twse.value).length > 0) {
      Object.assign(result, twse.value);
      apiSuccess = true;
    }
    if (tpex.status === 'fulfilled' && Object.keys(tpex.value).length > 0) {
      Object.assign(result, tpex.value);
      apiSuccess = true;
    }
  } catch { /* fallback below */ }

  // If API failed, use code-based classification for requested symbols
  if (!apiSuccess) {
    // Parse symbols from query if provided, otherwise generate for common ranges
    const symbols = (req.query.symbols as string)?.split(',') ?? [];
    for (const sym of symbols) {
      const code = sym.replace(/\.(TW|TWO)$/, '');
      if (!/^\d{4}$/.test(code)) continue;
      const base = classifyByCode(code);
      const industry = base === '電子業' ? classifyElectronics(code) : base;
      result[sym] = {
        industry,
        concept: CONCEPT_TAGS[code] || '',
      };
    }
  }

  // Overlay concept tags for all known stocks
  for (const [code, concept] of Object.entries(CONCEPT_TAGS)) {
    for (const suffix of ['.TW', '.TWO']) {
      const key = code + suffix;
      if (result[key]) {
        result[key].concept = concept;
      } else {
        // Add even if not in result yet
        const base = classifyByCode(code);
        const industry = base === '電子業' ? classifyElectronics(code) : base;
        result[key] = { industry, concept };
      }
    }
  }

  res.json({ data: result, count: Object.keys(result).length, apiSuccess });
}

async function fetchTWSEIndustry(): Promise<Record<string, CompanyInfo>> {
  const result: Record<string, CompanyInfo> = {};
  const urls = [
    'https://opendata.twse.com.tw/v1/opendata/t187ap03_L',
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const body = await r.json();

      if (Array.isArray(body) && body.length > 0) {
        for (const row of body) {
          const code = (row['公司代號'] ?? '').trim();
          if (!/^\d{4}$/.test(code)) continue;
          const symbol = code + '.TW';
          const industry = (row['產業類別'] ?? row['產業別'] ?? '').trim();
          const biz = (row['營業項目'] ?? '').trim();
          const concept = CONCEPT_TAGS[code] || extractConcept(biz);
          result[symbol] = { industry, concept };
        }
        if (Object.keys(result).length > 0) return result;
      }
    } catch { continue; }
  }
  return result;
}

async function fetchTPExIndustry(): Promise<Record<string, CompanyInfo>> {
  const result: Record<string, CompanyInfo> = {};
  try {
    const r = await fetch('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', {
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return result;
    const body: any[] = await r.json();
    for (const row of body) {
      const code = (row['公司代號'] ?? '').trim();
      if (!/^\d{4}$/.test(code)) continue;
      const symbol = code + '.TWO';
      const industry = (row['產業類別'] ?? row['產業別'] ?? '').trim();
      const biz = (row['營業項目'] ?? '').trim();
      result[symbol] = { industry, concept: CONCEPT_TAGS[code] || extractConcept(biz) };
    }
  } catch { /* ignore */ }
  return result;
}

function extractConcept(biz: string): string {
  if (!biz) return '';
  const keywords = [
    'AI', '人工智慧', '伺服器', '晶圓', '半導體', 'IC設計', '封裝', '測試',
    'PCB', '印刷電路', '散熱', '連接器', '光通訊', '網通', '5G',
    '面板', 'LED', '顯示器', '觸控',
    '電動車', '汽車', '車用', '電池', '儲能', '太陽能', '風電',
    '生技', '新藥', '醫療', '基因',
    '金融', '銀行', '保險', '證券',
    '鋼鐵', '水泥', '塑膠', '化學', '紡織', '食品',
    '航運', '航空', '物流',
    '機器人', '自動化', '工具機',
    '記憶體', 'DRAM', 'NAND', 'SSD',
    '軟體', '雲端', 'SaaS',
  ];
  for (const kw of keywords) {
    if (biz.includes(kw)) return kw;
  }
  return '';
}
