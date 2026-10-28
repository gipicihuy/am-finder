import type { Locale } from "@/lib/i18n";

/** Token {brand} = logo + nama AM Preset Finder (link ke beranda), {tiktok} = link TikTok @givydev. */
export type LegalSection = { h: string; p?: string[]; ul?: string[]; intro?: boolean };
export type LegalDoc = {
  metaTitle: string;
  metaDesc: string;
  title: string;
  numbered: boolean;
  sections: LegalSection[];
  crossHref: string;
  crossText: string;
};
export type LegalBundle = { back: string; updated: string; crossPrefix: string; terms: LegalDoc; privacy: LegalDoc };

const id: LegalBundle = {
  back: "Kembali ke Beranda",
  updated: "Terakhir diperbarui: 10 Oktober 2026",
  crossPrefix: "Baca juga:",
  terms: {
    metaTitle: "Ketentuan Layanan | AM Preset Finder",
    metaDesc: "Ketentuan layanan AM Preset Finder, layanan pencari tautan preset Alight Motion dari TikTok.",
    title: "Ketentuan Layanan",
    numbered: true,
    crossHref: "/privacy",
    crossText: "Kebijakan Privasi",
    sections: [
      { h: "Tentang Layanan", intro: true, p: ["{brand} adalah layanan pencarian gratis untuk menemukan tautan preset Alight Motion yang dibagikan kreator lewat video TikTok. Tersedia dua cara: tempel link video, atau cari dengan kata kunci. Tanpa daftar akun dan tanpa biaya."] },
      { h: "Penggunaan Hasil Pencarian", p: ["Seluruh tautan preset pada hasil pencarian berasal dari kreator yang mengunggahnya. Anda dipersilakan menggunakan tautan tersebut untuk keperluan penyuntingan pribadi dan wajib mencantumkan kredit kepada kreator pemiliknya."] },
      { h: "Batas Tanggung Jawab", ul: [
        "Hasil pencarian diambil dari data publik di TikTok. Apabila kreator menghapus video atau komentar aslinya, tautan terkait ikut tidak berlaku dan tidak lagi dapat ditemukan.",
        "Layanan ini tidak menyimpan berkas preset. Setiap tautan mengarah ke layanan pihak ketiga, termasuk TikTok, Alight Motion, dan penyedia hosting berkas, yang berada di luar kendali kami.",
        "Layanan ini tidak berafiliasi dengan TikTok maupun Alight Motion (Alight Creative Inc). Seluruh nama dan merek dagang merupakan milik pemiliknya masing-masing."] },
      { h: "Larangan", p: ["Anda dilarang menggunakan layanan ini untuk spam, serangan terhadap server, atau pelanggaran hak pihak lain maupun ketentuan TikTok dan Alight Motion. Kami berhak membatasi akses bagi pihak yang merugikan pengguna lain."] },
      { h: "Perubahan Ketentuan", p: ["Ketentuan ini dapat diubah sewaktu-waktu tanpa pemberitahuan sebelumnya. Tanggal pembaruan terakhir ditampilkan di bagian atas halaman."] },
      { h: "Kontak", p: ["Pertanyaan mengenai ketentuan ini dapat disampaikan melalui pesan langsung di TikTok {tiktok}."] },
    ],
  },
  privacy: {
    metaTitle: "Kebijakan Privasi | AM Preset Finder",
    metaDesc: "Kebijakan privasi AM Preset Finder: data yang diproses saat Anda menggunakan layanan ini.",
    title: "Kebijakan Privasi",
    numbered: false,
    crossHref: "/terms",
    crossText: "Ketentuan Layanan",
    sections: [
      { h: "Data yang Diproses", p: ["Saat Anda menggunakan layanan ini, tautan video atau kata kunci yang Anda masukkan diproses oleh server untuk menghasilkan pencarian. Setiap permintaan secara otomatis membawa alamat IP dan user agent perangkat, sebagaimana berlaku pada situs web pada umumnya.", "Layanan ini tidak memiliki akun pengguna, tidak memiliki formulir pendaftaran, dan tidak menggunakan cookie iklan."] },
      { h: "Penyimpanan Lokal", p: ["Apabila fitur ingat tautan diaktifkan, tautan terakhir disimpan di peramban Anda melalui localStorage. Data tersebut berada di perangkat Anda dan dapat dihapus sewaktu-waktu melalui pengaturan peramban."] },
      { h: "Layanan Pihak Ketiga", p: ["Untuk mengambil hasil pencarian, server memanggil layanan pihak ketiga, termasuk TikTok. Kami tidak mengontrol cara pihak ketiga memperlakukan data Anda, sehingga kebijakan masing-masing pihak yang berlaku untuk bagian tersebut."] },
      { h: "Penjualan Data", p: ["Data pencarian Anda tidak dijual kepada pihak mana pun."] },
      { h: "Perubahan Kebijakan", p: ["Kebijakan ini dapat diubah sewaktu-waktu. Tanggal pembaruan terakhir ditampilkan di bagian atas halaman."] },
      { h: "Kontak", p: ["Pertanyaan mengenai kebijakan privasi ini dapat disampaikan melalui pesan langsung di TikTok {tiktok}."] },
    ],
  },
};

const en: LegalBundle = {
  back: "Back to Home",
  updated: "Last updated: October 10, 2026",
  crossPrefix: "See also:",
  terms: {
    metaTitle: "Terms of Service | AM Preset Finder",
    metaDesc: "Terms of service for AM Preset Finder, a service that finds Alight Motion preset links from TikTok.",
    title: "Terms of Service",
    numbered: true,
    crossHref: "/privacy",
    crossText: "Privacy Policy",
    sections: [
      { h: "About the Service", intro: true, p: ["{brand} is a free search service for finding Alight Motion preset links that creators share in TikTok videos. There are two ways to search: paste a video link, or search by keyword. No account and no fee."] },
      { h: "Use of Search Results", p: ["All preset links in the results come from the creators who posted them. You may use these links for personal editing and must credit the creator who owns them."] },
      { h: "Limitation of Liability", ul: [
        "Results are taken from public data on TikTok. If a creator deletes the original video or comment, the related link stops working and can no longer be found.",
        "This service does not store preset files. Every link points to a third-party service, including TikTok, Alight Motion and file hosting providers, which are outside our control.",
        "This service is not affiliated with TikTok or Alight Motion (Alight Creative Inc). All names and trademarks belong to their respective owners."] },
      { h: "Prohibited Use", p: ["You may not use this service for spam, attacks on the server, or violations of the rights of others or the terms of TikTok and Alight Motion. We reserve the right to restrict access for anyone who harms other users."] },
      { h: "Changes to These Terms", p: ["These terms may change at any time without prior notice. The date of the latest update is shown at the top of the page."] },
      { h: "Contact", p: ["Questions about these terms can be sent as a direct message on TikTok {tiktok}."] },
    ],
  },
  privacy: {
    metaTitle: "Privacy Policy | AM Preset Finder",
    metaDesc: "Privacy policy for AM Preset Finder: the data processed when you use this service.",
    title: "Privacy Policy",
    numbered: false,
    crossHref: "/terms",
    crossText: "Terms of Service",
    sections: [
      { h: "Data We Process", p: ["When you use this service, the video link or keyword you enter is processed by the server to produce the search. Every request automatically carries your device's IP address and user agent, as with any website.", "This service has no user accounts, no sign-up form, and uses no advertising cookies."] },
      { h: "Local Storage", p: ["If the remember-link feature is on, your last link is saved in your browser through localStorage. This data stays on your device and can be cleared at any time in your browser settings."] },
      { h: "Third-Party Services", p: ["To fetch results, the server calls third-party services, including TikTok. We do not control how third parties handle your data, so their own policies apply to that part."] },
      { h: "Sale of Data", p: ["Your search data is not sold to anyone."] },
      { h: "Changes to This Policy", p: ["This policy may change at any time. The date of the latest update is shown at the top of the page."] },
      { h: "Contact", p: ["Questions about this privacy policy can be sent as a direct message on TikTok {tiktok}."] },
    ],
  },
};

const zh: LegalBundle = {
  back: "返回首页",
  updated: "最后更新：2026 年 10 月 10 日",
  crossPrefix: "另请阅读：",
  terms: {
    metaTitle: "服务条款 | AM Preset Finder",
    metaDesc: "AM Preset Finder 服务条款，一个从 TikTok 查找 Alight Motion 预设链接的服务。",
    title: "服务条款",
    numbered: true,
    crossHref: "/privacy",
    crossText: "隐私政策",
    sections: [
      { h: "关于本服务", intro: true, p: ["{brand} 是一项免费搜索服务，用于查找创作者在 TikTok 视频中分享的 Alight Motion 预设链接。有两种搜索方式：粘贴视频链接，或按关键词搜索。无需注册账号，也不收费。"] },
      { h: "搜索结果的使用", p: ["搜索结果中的所有预设链接均来自发布它们的创作者。您可以将这些链接用于个人剪辑，并须向其所有者创作者注明出处。"] },
      { h: "责任限制", ul: [
        "搜索结果取自 TikTok 上的公开数据。若创作者删除原视频或评论，相关链接将随之失效，也无法再被找到。",
        "本服务不存储预设文件。每个链接都指向第三方服务，包括 TikTok、Alight Motion 以及文件托管服务商，这些均不在我们的控制范围内。",
        "本服务与 TikTok 及 Alight Motion（Alight Creative Inc）没有任何关联。所有名称和商标均归其各自所有者所有。"] },
      { h: "禁止行为", p: ["您不得将本服务用于垃圾信息、攻击服务器，或侵犯他人权利及违反 TikTok 与 Alight Motion 的条款。我们有权限制损害其他用户的人员访问。"] },
      { h: "条款变更", p: ["本条款可能随时更改，恕不另行通知。最近更新日期显示在页面顶部。"] },
      { h: "联系方式", p: ["如对本条款有疑问，可通过 TikTok 私信联系 {tiktok}。"] },
    ],
  },
  privacy: {
    metaTitle: "隐私政策 | AM Preset Finder",
    metaDesc: "AM Preset Finder 隐私政策：您使用本服务时处理的数据。",
    title: "隐私政策",
    numbered: false,
    crossHref: "/terms",
    crossText: "服务条款",
    sections: [
      { h: "我们处理的数据", p: ["使用本服务时，您输入的视频链接或关键词会由服务器处理以生成搜索结果。与一般网站一样，每次请求都会自动带上您设备的 IP 地址和 user agent。", "本服务没有用户账号，没有注册表单，也不使用广告 cookie。"] },
      { h: "本地存储", p: ["若开启了记住链接功能，您最近的链接会通过 localStorage 保存在浏览器中。该数据保留在您的设备上，可随时在浏览器设置中清除。"] },
      { h: "第三方服务", p: ["为获取搜索结果，服务器会调用第三方服务，包括 TikTok。我们无法控制第三方如何处理您的数据，这部分适用其各自的政策。"] },
      { h: "数据出售", p: ["您的搜索数据不会出售给任何人。"] },
      { h: "政策变更", p: ["本政策可能随时更改。最近更新日期显示在页面顶部。"] },
      { h: "联系方式", p: ["如对本隐私政策有疑问，可通过 TikTok 私信联系 {tiktok}。"] },
    ],
  },
};

export function getLegal(locale: Locale): LegalBundle {
  return locale === "id" ? id : locale === "zh" ? zh : en;
}
