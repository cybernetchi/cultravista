// All landing-page copy in one typed dictionary (EN + Traditional Chinese).
// Deliberately not an i18n library — the landing page and the exhibit viewer
// share the same lightweight local-state locale pattern (see ExhibitView).

export type Lang = "en" | "zh";

// Single place to change the public contact address.
export const CONTACT_EMAIL = "hi@kachi-chan.com";

export interface LandingCopy {
  header: {
    signIn: string;
    requestTrial: string;
  };
  hero: {
    tagline: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  demo: {
    heading: string;
    subheading: string;
    placeholderTitle: string;
    placeholderBody: string;
  };
  how: {
    heading: string;
    steps: { title: string; body: string }[];
  };
  institutions: {
    heading: string;
    body: string;
    points: string[];
    cta: string;
    mailSubject: string;
  };
  footer: {
    company: string;
    contact: string;
    signIn: string;
  };
}

export const landingCopy: Record<Lang, LandingCopy> = {
  en: {
    header: {
      signIn: "Sign in",
      requestTrial: "Request alpha trial",
    },
    hero: {
      tagline: "Cultural heritage, captured in 3D",
      title: "Turn artefacts and places into living 3D archives",
      subtitle:
        "CultraVista captures cultural heritage with Gaussian Splatting, then adds what a scan alone can't: archival metadata, spatial storytelling, and one-click publishing for museums and cultural institutions.",
      ctaPrimary: "Request alpha trial",
      ctaSecondary: "Sign in",
    },
    demo: {
      heading: "See it for yourself",
      subheading:
        "These are real published exhibits, rendered live in your browser — drag to orbit, scroll to zoom.",
      placeholderTitle: "Live exhibits coming soon",
      placeholderBody:
        "Published exhibits will appear here automatically. In the meantime, request a trial to explore the alpha with your own captures.",
    },
    how: {
      heading: "How it works",
      steps: [
        {
          title: "Capture",
          body: "Photograph an artefact or site with your phone. We reconstruct it as a photorealistic 3D Gaussian Splat — no special hardware.",
        },
        {
          title: "Curate",
          body: "Add bilingual archival metadata, rights and provenance, then anchor stories directly in 3D space with hotspots and guided tours.",
        },
        {
          title: "Publish",
          body: "Share a public exhibit page or embed it on your own website with a single iframe snippet.",
        },
      ],
    },
    institutions: {
      heading: "For museums & cultural institutions",
      body: "CultraVista is built for the archive, not just the demo. Every exhibit carries the metadata your collection systems expect.",
      points: [
        "Bilingual (EN / 繁體中文) titles, descriptions and narratives",
        "Rights, licence and attribution on every capture",
        "Embeddable exhibits that live on your own site",
      ],
      cta: "Tell us about your institution",
      mailSubject: "CultraVista alpha trial — institution enquiry",
    },
    footer: {
      company: "Space and Place Limited",
      contact: "Contact",
      signIn: "Sign in",
    },
  },
  zh: {
    header: {
      signIn: "登入",
      requestTrial: "申請試用",
    },
    hero: {
      tagline: "以 3D 保存文化遺產",
      title: "將文物與場所化為立體的活檔案",
      subtitle:
        "CultraVista 以高斯潑濺（Gaussian Splatting）技術擷取文化遺產，並補上掃描本身欠缺的一切：檔案級後設資料、空間敘事，以及為博物館與文化機構而設的一鍵發佈。",
      ctaPrimary: "申請 Alpha 試用",
      ctaSecondary: "登入",
    },
    demo: {
      heading: "親身體驗",
      subheading: "以下是已發佈的真實展品，於瀏覽器即時渲染——拖曳旋轉、滾動縮放。",
      placeholderTitle: "線上展品即將推出",
      placeholderBody:
        "已發佈的展品將自動顯示於此。歡迎先申請試用，以自己的擷取內容探索 Alpha 版本。",
    },
    how: {
      heading: "運作方式",
      steps: [
        {
          title: "擷取",
          body: "用手機拍攝文物或場所，我們會將其重建為逼真的 3D 高斯潑濺模型——毋須專業器材。",
        },
        {
          title: "策展",
          body: "加入雙語檔案後設資料、版權與來源資訊，並以熱點和導覽路線把故事直接安放於 3D 空間之中。",
        },
        {
          title: "發佈",
          body: "分享公開展品頁面，或以一段 iframe 程式碼將展品嵌入貴機構網站。",
        },
      ],
    },
    institutions: {
      heading: "為博物館與文化機構而設",
      body: "CultraVista 為典藏而生，不止於展示。每件展品均載有典藏系統所需的後設資料。",
      points: [
        "雙語（英文／繁體中文）標題、描述與敘事",
        "每次擷取均記錄版權、授權與署名",
        "可嵌入貴機構網站的展品頁面",
      ],
      cta: "告訴我們貴機構的需要",
      mailSubject: "CultraVista Alpha 試用——機構查詢",
    },
    footer: {
      company: "Space and Place Limited",
      contact: "聯絡我們",
      signIn: "登入",
    },
  },
};
