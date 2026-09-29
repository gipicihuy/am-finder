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
    howTitle: string;
    howSteps: string[];
  };
  header: {
    brand: string;
    tagline: string;
    byline: string;
  };
  footer: {
    brand: string;
    note: string;
    columns: UiColumn[];
    copyright: string;
    disclaimer: string;
  };
};

export const ui: UiTexts = raw;
