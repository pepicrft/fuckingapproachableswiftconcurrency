import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

export default function(eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/_redirects");
  eleventyConfig.addPassthroughCopy("src/SKILL.md");

  // Add language data globally
  eleventyConfig.addGlobalData("languages", {
    en: { name: "English", dir: "ltr", native: "English" },
    es: { name: "Spanish", dir: "ltr", native: "Español" },
    "pt-BR": { name: "Portuguese (Brazil)", dir: "ltr", native: "Português (Brasil)" },
    "pt-PT": { name: "Portuguese (Portugal)", dir: "ltr", native: "Português (Portugal)" },
    ko: { name: "Korean", dir: "ltr", native: "한국어" },
    ja: { name: "Japanese", dir: "ltr", native: "日本語" },
    "zh-CN": { name: "Chinese (Simplified)", dir: "ltr", native: "简体中文" },
    "zh-TW": { name: "Chinese (Traditional)", dir: "ltr", native: "繁體中文" },
    ar: { name: "Arabic", dir: "rtl", native: "العربية" },
    ru: { name: "Russian", dir: "ltr", native: "Русский" }
  });

  // Dev server configuration: redirect root to /en/
  eleventyConfig.setServerOptions({
    onRequest: {
      "/": function({ url }) {
        const redirectUrl = new URL("/en/", url);
        return Response.redirect(redirectUrl, 302);
      }
    }
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_layouts"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
}
