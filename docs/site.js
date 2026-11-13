const owner = "azmisahin-gov";
const repository = "mihenk";
const releasesUrl = `https://api.github.com/repos/${owner}/${repository}/releases`;

const byId = (id) => document.getElementById(id);

function formatDate(value) {
  if (!value) return "Tarih bilgisi yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih bilgisi yok";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(date);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function safeDownloadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" ? url.href : null;
  } catch {
    return null;
  }
}

function installerAssets(release) {
  return (release?.assets ?? []).filter((asset) => {
    const name = String(asset.name ?? "").toLowerCase();
    if (name.endsWith(".sig") || name.endsWith(".json") || name.includes("latest")) return false;
    return name.endsWith(".exe") || name.endsWith(".msi") || name.endsWith(".deb") ||
      name.endsWith(".appimage") || name.endsWith(".appimage.tar.gz");
  });
}

function displayAssetName(asset) {
  const name = String(asset.name ?? "").toLowerCase();
  if (name.endsWith(".exe")) return "Windows kurulum sihirbazı · kullanıcı hesabı (EXE)";
  if (name.endsWith(".msi")) return "Windows bilgisayar geneli kurulumu · yönetici izni (MSI)";
  if (name.endsWith(".deb")) return "Pardus / Debian paketi (DEB)";
  if (name.endsWith(".appimage") || name.endsWith(".appimage.tar.gz")) return "Linux taşınabilir paketi (AppImage)";
  return asset.name;
}
function makeAssetLink(asset) {
  const url = safeDownloadUrl(asset.browser_download_url);
  if (!url) return null;
  const link = document.createElement("a");
  link.className = "asset-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const name = document.createElement("span");
  name.textContent = displayAssetName(asset);
  name.title = asset.name;
  const size = document.createElement("span");
  size.className = "asset-size";
  size.textContent = formatSize(asset.size);
  link.append(name, size);
  return link;
}

function showAssets(targetId, assets, predicate, emptyText) {
  const target = byId(targetId);
  target.replaceChildren();
  const matches = assets.filter(predicate);
  if (matches.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  for (const asset of matches) {
    const link = makeAssetLink(asset);
    if (link) target.append(link);
  }
  if (!target.childElementCount) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    target.append(empty);
  }
}

function showRelease(targetId, release, unavailableText) {
  const target = byId(targetId);
  target.replaceChildren();
  if (!release) {
    const text = document.createElement("p");
    text.className = "empty-state";
    text.textContent = unavailableText;
    target.append(text);
    return;
  }

  const meta = document.createElement("p");
  const version = document.createElement("strong");
  version.textContent = release.name || release.tag_name || "MİHENK";
  meta.append(version, document.createTextNode(` · ${formatDate(release.published_at)}`));

  const notes = document.createElement("p");
  notes.className = "release-notes";
  notes.textContent = String(release.body || "Bu sürüm için yayın notu eklenmemiş.").slice(0, 3000);

  const link = document.createElement("a");
  link.href = safeDownloadUrl(release.html_url) || `https://github.com/${owner}/${repository}/releases`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "GitHub sürüm sayfasını aç ↗";
  target.append(meta, notes, link);

  const assets = installerAssets(release);
  if (assets.length > 0) {
    const heading = document.createElement("p");
    heading.className = "release-assets-heading";
    heading.textContent = "Bu kanaldaki kurulum paketleri";
    const assetList = document.createElement("div");
    assetList.className = "release-asset-list";
    for (const asset of assets) {
      const assetLink = makeAssetLink(asset);
      if (assetLink) assetList.append(assetLink);
    }
    if (assetList.childElementCount > 0) {
      target.append(heading, assetList);
    }
  }
}

async function loadReleases() {
  const status = byId("page-status");
  try {
    const response = await fetch(releasesUrl + "?per_page=20", {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-cache"
    });
    if (!response.ok) throw new Error("GitHub Releases yanıtı: " + response.status);
    const releases = await response.json();
    const stable = releases.find((release) => !release.draft && !release.prerelease) || null;
    const preview = releases.find((release) => !release.draft && (release.prerelease || release.tag_name === "preview")) || null;
    const downloadRelease = stable || preview;

    if (stable) {
      byId("latest-version").textContent = stable.name || stable.tag_name;
      byId("latest-date").textContent = formatDate(stable.published_at);
      byId("stable-chip").textContent = "Kararlı sürüm: " + stable.tag_name;
      status.textContent = "Kararlı sürüm bilgisi güncel.";
    } else if (preview) {
      byId("latest-version").textContent = preview.name || preview.tag_name;
      byId("latest-date").textContent = "Geliştirme önizlemesi · " + formatDate(preview.published_at);
      byId("stable-chip").textContent = "Kararlı sürüm yok · Önizleme indiriliyor";
      status.textContent = "Kararlı sürüm henüz yayımlanmadı. İndirme kartlarında test amaçlı geliştirme önizlemesi gösteriliyor.";
    } else {
      byId("latest-version").textContent = "Henüz sürüm yok";
      byId("latest-date").textContent = "İlk kararlı sürüm bekleniyor";
      byId("stable-chip").textContent = "Henüz indirilebilir paket yok";
      status.textContent = "Henüz indirilebilir kararlı veya önizleme sürümü yayımlanmadı.";
    }

    showRelease("stable-release", stable, "Henüz kararlı sürüm yayımlanmadı.");
    showRelease("preview-release", preview, "Henüz geliştirme önizlemesi yayımlanmadı.");

    const downloadableAssets = installerAssets(downloadRelease);
    const emptyMessage = stable
      ? "Kararlı kanalda bu platform için paket yok."
      : "Önizleme kanalında bu platform için paket yok.";
    showAssets("windows-assets", downloadableAssets, (asset) => asset.name.toLowerCase().endsWith(".exe") || asset.name.toLowerCase().endsWith(".msi"), emptyMessage);
    showAssets("debian-assets", downloadableAssets, (asset) => asset.name.toLowerCase().endsWith(".deb"), emptyMessage);
    showAssets("appimage-assets", downloadableAssets, (asset) => asset.name.toLowerCase().endsWith(".appimage") || asset.name.toLowerCase().endsWith(".appimage.tar.gz"), emptyMessage);
  } catch (error) {
    console.error("MİHENK yayın bilgisi alınamadı:", error);
    status.textContent = "Yayın bilgisi şu anda alınamadı. GitHub Releases sayfasını açabilirsiniz.";
    byId("stable-chip").textContent = "Yayın durumu kontrol edilemiyor";
  }
}
void loadReleases();
