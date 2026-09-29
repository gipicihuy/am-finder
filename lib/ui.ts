import raw from "@/ui.json";

type UiLink = { label: string; href: string };

type UiTexts = {
  buttons: {
    search: string;
    searching: string;
    copy: string;
    copied: string;
    openPreset: string;
    openFile: string;
  };
  states: {
    loading: string;
    notFound: string;
  };
  header: {
    brand: string;
    links: UiLink[];
  };
  footer: {
    note: string;
    links: UiLink[];
    wordmark: string;
    copyright: string;
  };
};

export const ui: UiTexts = raw;
