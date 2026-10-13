import raw from "@/ui.json";

type UiLink = { label: string; href?: string };

type UiColumn = {
  title: string;
  items: UiLink[];
};

type UiTexts = {
  buttons: {
    search: string;
    searching: string;
    paste: string;
    copy: string;
    copied: string;
    openPreset: string;
    openFile: string;
  };
  states: {
    loading: string;
    notFound: string;
    commentsDisabled: string;
    noLink: string;
    shareSources: string;
    shareChat: string;
    shareChannel: string;
    shareGroup: string;
    shareTelegram: string;
    howTitle: string;
    howSteps: string[];
    searchHowSteps: string[];
  };
  header: {
    brand: string;
    tagline: string;
  };
  footer: {
    brand: string;
    note: string;
    columns: UiColumn[];
    copyright: string;
    disclaimer: string;
  };
  donatur: {
    title: string;
    intro: string;
    monthlyTitle: string;
    topTitle: string;
    listTitle: string;
    seeAll: string;
    topDonation: string;
    colName: string;
    colAmount: string;
    colDate: string;
    counterBefore: string;
    counterMiddle: string;
    counterAfter: string;
    totalLabel: string;
    peopleLabel: string;
    empty: string;
    emptyTop: string;
    emptyMonthly: string;
    emptyMonthlyCta: string;
    donate: string;
    donateHref: string;
  };
};

export const ui: UiTexts = raw;
