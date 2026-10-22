import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const $ = id => document.getElementById(id);

// アプリ共通のSupabase接続設定（公開用キー）
const SUPABASE_URL = "https://glkuzweleefwoikewlyf.supabase.co";
const SUPABASE_KEY = "sb_publishable_rmZs08Q_KCGYCJz77rND0A_TeEC_-nb";

let sb = null;
let user = null;
let family = null;
let photoFile = null;
let photoData = "";
let records = [];

function localDateTimeValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localDateValue(date = new Date()) {
  return localDateTimeValue(date).slice(0, 10);
}

function dateTimeToISO(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("観察日時を正しく選択してください。");
  }

  return date.toISOString();
}

function recordDateTime(record) {
  if (record.observed_at) {
    const date = new Date(record.observed_at);

    if (!Number.isNaN(date.getTime())) return date;
  }

  if (record.observed_on) {
    const date = new Date(`${record.observed_on}T00:00:00`);

    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function formatDateTime(record) {
  const date = recordDateTime(record);

  if (!date) return "日時未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function dateTimeForInput(record) {
  const date = recordDateTime(record);

  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

$("dateInput").value = localDateTimeValue();

function msg(id, text, err = false) {
  $(id).textContent = text;
  $(id).style.color = err ? "#b42318" : "";
}

/*
 * Supabase接続設定
 *
 * 接続情報はアプリに組み込んでいるため、
 * 利用者ごとに設定を入力する必要はありません。
 */
function settings() {
  return {
    url: SUPABASE_URL,
    key: SUPABASE_KEY
  };
}

function connect() {
  try {
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch (error) {
    console.error("Supabase接続の初期化に失敗しました", error);
    sb = null;
    return false;
  }
}

function showApp(logged) {
  $("settingsPanel").hidden = true;
  $("authPanel").hidden = !(!logged && sb);
  $("appPanel").hidden = !logged;

  if (logged) {
    loadRecords();
  }
}

/*
 * 接続設定はアプリに組み込み済み。
 * 通常は設定画面を表示する必要はありません。
 */
function openSettings() {
  const s = settings();

  $("supabaseUrl").value = s.url || "";
  $("supabaseKey").value = s.key || "";
  $("settingsPanel").hidden = false;
  $("authPanel").hidden = true;
  $("appPanel").hidden = true;
}

$("settingsBtn").onclick = () => {
  msg(
    "settingsMsg",
    "接続設定はアプリに組み込み済みです。変更する必要はありません。"
  );
};

$("closeSettingsBtn").onclick = () => {
  showApp(!!user);
};

$("saveSettingsBtn").onclick = async () => {
  if (!connect()) {
    return msg(
      "settingsMsg",
      "接続設定を読み込めませんでした。",
      true
    );
  }

  try {
    const { error } = await sb.auth.getSession();

    if (error) throw error;

    msg(
      "settingsMsg",
      "接続設定はアプリに組み込み済みです。ログイン画面を開きます。"
    );

    setTimeout(() => showApp(!!user), 500);
  } catch (error) {
    msg("settingsMsg", `接続エラー：${error.message}`, true);
  }
};

async function init() {
  if (!connect()) {
    openSettings();
    return;
  }

  const {
    data: { session }
  } = await sb.auth.getSession();

  user = session?.user || null;

  showApp(!!user);

  if (user) {
    await loadFamily();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    user = session?.user || null;

    showApp(!!user);

    if (user) {
      await loadFamily();
    }
  });
}

/*
 * 新規登録
 */
$("signUpBtn").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || password.length < 6) {
    return msg(
      "authMsg",
      "メールアドレスと6文字以上のパスワードを入力してください。",
      true
    );
  }

  const { error } = await sb.auth.signUp({
    email,
    password
  });

  msg(
    "authMsg",
    error
      ? error.message
      : "登録しました。確認メールが届いた場合は、メール内のリンクを開いてください。",
    !!error
  );
};

/*
 * ログイン
 */
$("signInBtn").onclick = async () => {
  const { error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });

  msg(
    "authMsg",
    error ? error.message : "ログインしました。",
    !!error
  );
};

/*
 * ログアウト
 */
$("signOutBtn").onclick = async () => {
  await sb.auth.signOut();

  user = null;
  family = null;

  showApp(false);
};

/*
 * 写真を縮小してJPEG形式に変換
 */
function resizeImage(file, max = 1400, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      const scale = Math.min(
        1,
        max / Math.max(image.width, image.height)
      );

      const canvas = document.createElement("canvas");

      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      canvas.getContext("2d").drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );

      URL.revokeObjectURL(url);

      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Error("画像を読み込めませんでした"));
    };

    image.src = url;
  });
}

/*
 * 写真選択時のプレビュー
 */
$("photoInput").onchange = async event => {
  photoFile = event.target.files?.[0] || null;
  photoData = "";

  if (!photoFile) return;

  try {
    photoData = await resizeImage(photoFile);

    $("photoPreview").innerHTML =
      `<img alt="選択した写真" src="${photoData}">`;
  } catch (error) {
    photoFile = null;
    photoData = "";

    $("photoPreview").textContent = "📷";

    msg("saveMsg", error.message, true);
  }
};

/*
 * 観察記録の新規登録
 */
$("recordForm").onsubmit = async event => {
  event.preventDefault();

  if (!sb || !user) {
    return msg(
      "saveMsg",
      "保存するにはログインしてください。",
      true
    );
  }

  if (!family) {
    return msg(
      "saveMsg",
      "先に家族グループを作成するか、招待コードで参加してください。",
      true
    );
  }

  const name = $("nameInput").value.trim();

  if (!name) {
    return msg(
      "saveMsg",
      "名前を入力してください。未確定なら「未同定の生きもの」でもOKです。",
      true
    );
  }

  const observedAt = $("dateInput").value;

  if (!observedAt) {
    return msg(
      "saveMsg",
      "観察日時を入力してください。",
      true
    );
  }

  const saveButton = $("recordForm").querySelector(
    'button[type="submit"]'
  );

  saveButton.disabled = true;

  msg("saveMsg", "保存しています…");

  let uploadedPath = null;

  try {
    let image_path = null;

    if (photoFile && photoData) {
      const blob = await (await fetch(photoData)).blob();

      image_path =
        `${family.id}/${user.id}/${crypto.randomUUID()}.jpg`;

      uploadedPath = image_path;

      const { error } = await sb.storage
        .from("observation-photos")
        .upload(image_path, blob, {
          contentType: "image/jpeg"
        });

      if (error) throw error;
    }

    const row = {
      family_id: family.id,
      user_id: user.id,
      name,
      category: $("categoryInput").value,
      observed_on: observedAt.slice(0, 10),
      observed_at: dateTimeToISO(observedAt),
      place: $("placeInput").value.trim(),
      notes: $("notesInput").value.trim(),
      confirmed: $("confirmedInput").checked,
      image_path
    };

    const { error } = await sb
      .from("observations")
      .insert(row);

    if (error) throw error;

    $("recordForm").reset();

    $("dateInput").value = localDateTimeValue();

    photoFile = null;
    photoData = "";

    $("photoPreview").textContent = "📷";

    msg("saveMsg", "観察記録を保存しました！");

    await loadRecords();
  } catch (error) {
    if (uploadedPath) {
      await sb.storage
        .from("observation-photos")
        .remove([uploadedPath]);
    }

    msg(
      "saveMsg",
      `保存できませんでした：${error.message}`,
      true
    );
  } finally {
    saveButton.disabled = false;
  }
};

/*
 * 家族グループの読み込み
 */
async function loadFamily() {
  if (!sb || !user) return;

  const { data, error } = await sb
    .from("family_members")
    .select("family_id,families(id,name,invite_code)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    $("familyInfo").textContent =
      "家族グループを読み込めません。セットアップ手順を確認してください。";

    return;
  }

  family = data?.families || null;

  $("familyInfo").textContent = family
    ? `参加中：${family.name} ／ 招待コード：${family.invite_code}`
    : "まだ家族グループに参加していません。";

  if (family) {
    await loadRecords();
  }
}

/*
 * 家族グループを作成
 */
$("createFamilyBtn").onclick = async () => {
  if (!user) {
    return msg("familyMsg", "ログインしてください。", true);
  }

  if (family) {
    return msg(
      "familyMsg",
      "すでに家族グループに参加しています。",
      true
    );
  }

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));

  const code = [...bytes]
    .map(x => chars[x % chars.length])
    .join("");

  const { error } = await sb.rpc("create_family", {
    family_name: "わが家の庭",
    invite: code
  });

  if (error) {
    return msg(
      "familyMsg",
      `作成できませんでした：${error.message}`,
      true
    );
  }

  msg(
    "familyMsg",
    "家族グループを作成しました。招待コードを家族に共有してください。"
  );

  await loadFamily();
};

/*
 * 招待コードを使って家族グループに参加
 */
$("joinFamilyBtn").onclick = async () => {
  const code = $("inviteCode").value.trim().toUpperCase();

  if (!code) {
    return msg(
      "familyMsg",
      "招待コードを入力してください。",
      true
    );
  }

  const { error } = await sb.rpc("join_family", {
    invite: code
  });

  if (error) {
    return msg(
      "familyMsg",
      `参加できませんでした：${error.message}`,
      true
    );
  }

  msg("familyMsg", "家族グループに参加しました。");

  await loadFamily();
};

/*
 * 家族の観察記録を読み込む
 */
async function loadRecords() {
  if (!sb || !user || !family) {
    records = [];
    renderRecords();
    return;
  }

  const { data, error } = await sb
    .from("observations")
    .select("*")
    .eq("family_id", family.id)
    .order("observed_at", {
      ascending: false,
      nullsFirst: false
    })
    .order("observed_on", {
      ascending: false
    })
    .limit(300);

  if (error) {
    msg(
      "saveMsg",
      `記録の読み込みに失敗しました：${error.message}`,
      true
    );

    return;
  }

  records = data || [];

  for (const record of records) {
    if (record.image_path) {
      const { data: signedData } = await sb.storage
        .from("observation-photos")
        .createSignedUrl(record.image_path, 3600);

      record.image_url = signedData?.signedUrl || null;
    }
  }

  renderRecords();
}

/*
 * 観察記録一覧の描画
 */
function renderRecords() {
  const query = $("searchInput").value.trim().toLowerCase();
  const category = $("filterCategory").value;

  const shown = records.filter(record => {
    const matchesCategory =
      !category || record.category === category;

    const searchable = [
      record.name,
      record.place,
      record.notes,
      record.category
    ].join(" ").toLowerCase();

    return matchesCategory &&
      (!query || searchable.includes(query));
  });

  $("recordCount").textContent = records.length;

  $("speciesCount").textContent =
    new Set(records.map(record => record.name)).size;

  const currentMonth = localDateValue().slice(0, 7);

  $("monthCount").textContent = records.filter(record => {
    const date = recordDateTime(record);

    if (!date) return false;

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(date);

    const values = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    }

    return `${values.year}-${values.month}` === currentMonth;
  }).length;

  $("recordsGrid").replaceChildren();

  $("emptyState").hidden = shown.length > 0;

  shown.forEach(record => {
    const card = document.createElement("article");

    card.className = "card";

    const image = record.image_url
      ? `<img class="cardimg" src="${escapeHTML(record.image_url)}" alt="観察写真" loading="lazy">`
      : `<div class="placeholder">🌿</div>`;

    card.innerHTML = `
      ${image}
      <div class="cardbody">
        <span class="tag">${escapeHTML(record.category || "未分類")}</span>
        <h3></h3>
        <p class="meta"></p>
        <p class="meta"></p>
        <p class="notes"></p>
        <div class="actions">
          <button type="button" data-edit="${escapeHTML(record.id)}">編集</button>
          <button type="button" data-del="${escapeHTML(record.id)}">削除</button>
        </div>
      </div>
    `;

    card.querySelector("h3").textContent = record.name;

    card.querySelectorAll(".meta")[0].textContent =
      `🕒 ${formatDateTime(record)} · ${record.confirmed ? "種類確認済み" : "未確認"}`;

    card.querySelectorAll(".meta")[1].textContent =
      record.place ? `📍 ${record.place}` : "場所未記入";

    card.querySelector(".notes").textContent =
      record.notes || "備考なし";

    $("recordsGrid").append(card);
  });

  $("recordsGrid").querySelectorAll("[data-del]").forEach(button => {
    button.onclick = () => deleteRecord(button.dataset.del);
  });

  $("recordsGrid").querySelectorAll("[data-edit]").forEach(button => {
    button.onclick = () => editRecord(button.dataset.edit);
  });
}

/*
 * 観察記録の削除
 */
async function deleteRecord(id) {
  if (!confirm("この観察記録を削除しますか？")) return;

  const record = records.find(
    item => String(item.id) === String(id)
  );

  const { error } = await sb
    .from("observations")
    .delete()
    .eq("id", id)
    .eq("family_id", family.id);

  if (error) {
    alert(`削除できません：${error.message}`);
    return;
  }

  if (record?.image_path) {
    const { error: storageError } = await sb.storage
      .from("observation-photos")
      .remove([record.image_path]);

    if (storageError) {
      console.warn(
        "写真ファイルの削除に失敗しました",
        storageError.message
      );
    }
  }

  await loadRecords();
}

/*
 * 編集画面
 * 写真の差し替え、観察日・時刻の編集に対応
 */
async function editRecord(id) {
  const record = records.find(
    item => String(item.id) === String(id)
  );

  if (!record) return;

  document.getElementById("observationEditModal")?.remove();

  const currentDateTime = dateTimeForInput(record);

  const parts = currentDateTime
    ? currentDateTime.split("T")
    : ["", ""];

  let replacementPhotoFile = null;
  let replacementPhotoData = "";

  const modal = document.createElement("div");

  modal.id = "observationEditModal";

  modal.innerHTML = `
    <div class="edit-overlay"></div>

    <section class="edit-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editTitle">

      <div class="edit-heading">
        <h2 id="editTitle">観察記録を編集</h2>

        <button type="button"
          id="editClose"
          class="edit-close"
          aria-label="閉じる">×</button>
      </div>

      <form id="observationEditForm">

        <div class="edit-photo-area">
          <strong>登録済みの写真</strong>

          <div id="editPhotoPreview"
            class="edit-photo-preview"></div>

          <label class="edit-photo-button" for="editPhotoInput">
            📷 写真を変更する
          </label>

          <input id="editPhotoInput"
            class="edit-photo-input"
            type="file"
            accept="image/*">

          <p class="edit-photo-help">
            写真を選び直さなければ、現在の画像が維持されます。
          </p>
        </div>

        <label class="edit-label">
          生きものの名前
          <input id="editName"
            type="text"
            required
            maxlength="200">
        </label>

        <label class="edit-label">
          分類
          <select id="editCategory">
            ${[
              "未分類", "昆虫", "クモ", "鳥", "哺乳類",
              "両生類", "爬虫類", "魚", "植物", "菌類", "その他"
            ].map(value =>
              `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
            ).join("")}
          </select>
        </label>

        <div class="edit-datetime">
          <label class="edit-label">
            📅 観察日
            <input id="editDate" type="date" required>
          </label>

          <label class="edit-label">
            🕒 観察時刻
            <input id="editTime" type="time" required>
          </label>
        </div>

        <label class="edit-label">
          観察場所
          <input id="editPlace" type="text" maxlength="300">
        </label>

        <label class="edit-label">
          備考・コメント
          <textarea id="editNotes" rows="4" maxlength="5000"></textarea>
        </label>

        <label class="edit-confirmed">
          <input id="editConfirmed" type="checkbox">
          自分で種類を確認した
        </label>

        <p id="editMessage"
          class="edit-message"
          aria-live="polite"></p>

        <div class="edit-actions">
          <button type="button"
            id="editCancel"
            class="edit-cancel">キャンセル</button>

          <button type="submit"
            id="editSave"
            class="edit-save">変更を保存</button>
        </div>
      </form>
    </section>
  `;

  if (!document.getElementById("observationEditStyles")) {
    const style = document.createElement("style");

    style.id = "observationEditStyles";

    style.textContent = `
      #observationEditModal {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        box-sizing: border-box;
      }

      #observationEditModal * {
        box-sizing: border-box;
      }

      #observationEditModal .edit-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, .55);
      }

      #observationEditModal .edit-sheet {
        position: relative;
        z-index: 1;
        background: #fff;
        color: #24352b;
        width: 100%;
        max-width: 520px;
        max-height: 90%;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, .2);
      }

      #observationEditModal .edit-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 18px;
      }

      #observationEditModal .edit-heading h2 {
        margin: 0;
        font-size: 1.25rem;
      }

      #observationEditModal .edit-close {
        border: 0;
        background: #eef3ef;
        border-radius: 50%;
        width: 42px;
        height: 42px;
        font-size: 28px;
        line-height: 1;
        color: #24352b;
      }

      #observationEditModal .edit-label {
        display: block;
        min-width: 0;
        margin-bottom: 16px;
        font-weight: 600;
        font-size: 14px;
      }

      #observationEditModal .edit-label input,
      #observationEditModal .edit-label select,
      #observationEditModal .edit-label textarea {
        display: block;
        width: 100%;
        max-width: 100%;
        min-height: 46px;
        margin-top: 7px;
        padding: 10px;
        border: 1px solid #cbd5ce;
        border-radius: 9px;
        background: #fff;
        color: #24352b;
        font: inherit;
        font-size: 16px;
      }

      #observationEditModal .edit-label textarea {
        resize: vertical;
      }

      #observationEditModal .edit-datetime {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px;
      }

      #observationEditModal .edit-confirmed {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 6px 0 14px;
        font-size: 15px;
      }

      #observationEditModal .edit-confirmed input {
        width: 22px;
        height: 22px;
      }

      #observationEditModal .edit-message {
        color: #b42318;
        font-size: 14px;
        overflow-wrap: anywhere;
      }

      #observationEditModal .edit-actions {
        display: flex;
        gap: 10px;
        margin-top: 18px;
      }

      #observationEditModal .edit-actions button {
        flex: 1;
        min-height: 48px;
        border: 0;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 700;
      }

      #observationEditModal .edit-cancel {
        background: #edf1ee;
        color: #24352b;
      }

      #observationEditModal .edit-save {
        background: #2f6b4f;
        color: #fff;
      }

      #observationEditModal .edit-photo-area {
        margin-bottom: 20px;
        padding: 14px;
        background: #f4f7f4;
        border-radius: 12px;
      }

      #observationEditModal .edit-photo-preview {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100px;
        margin: 12px 0;
        border-radius: 10px;
        background: #e8eee9;
        overflow: hidden;
      }

      #observationEditModal .edit-photo-preview img {
        display: block;
        max-width: 100%;
        max-height: 240px;
        object-fit: contain;
      }

      #observationEditModal .edit-photo-button {
        display: block;
        width: 100%;
        padding: 13px;
        text-align: center;
        border-radius: 10px;
        background: #2f6b4f;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }

      #observationEditModal .edit-photo-input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      #observationEditModal .edit-photo-help {
        margin: 10px 0 0;
        font-size: 12px;
        color: #5d6d61;
      }

      @media (max-width: 380px) {
        #observationEditModal .edit-sheet {
          padding: 15px;
        }

        #observationEditModal .edit-datetime {
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
        }
      }
    `;

    document.head.append(style);
  }

  document.body.append(modal);

  $("editName").value = record.name || "";

  $("editCategory").value = [
    ...$("editCategory").options
  ].some(option => option.value === record.category)
    ? record.category
    : "その他";

  $("editDate").value = parts[0] || localDateValue();
  $("editTime").value = parts[1] || "12:00";
  $("editPlace").value = record.place || "";
  $("editNotes").value = record.notes || "";
  $("editConfirmed").checked = !!record.confirmed;

  const preview = $("editPhotoPreview");

  if (record.image_url) {
    preview.innerHTML =
      `<img src="${escapeHTML(record.image_url)}" alt="現在の観察写真">`;
  } else {
    preview.textContent = "写真は登録されていません";
  }

  $("editPhotoInput").addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    replacementPhotoFile = file;

    $("editMessage").textContent = "写真を読み込んでいます…";

    try {
      replacementPhotoData = await resizeImage(file);

      preview.innerHTML =
        `<img src="${replacementPhotoData}" alt="変更後の写真プレビュー">`;

      $("editMessage").textContent =
        "新しい写真を選択しました。保存ボタンを押してください。";
    } catch (error) {
      replacementPhotoFile = null;
      replacementPhotoData = "";

      $("editMessage").textContent = error.message;
    }
  });

  const closeModal = () => modal.remove();

  $("editClose").onclick = closeModal;
  $("editCancel").onclick = closeModal;

  modal.querySelector(".edit-overlay").onclick = closeModal;

  $("observationEditForm").onsubmit = async event => {
    event.preventDefault();

    const name = $("editName").value.trim();
    const date = $("editDate").value;
    const time = $("editTime").value;

    if (!name) {
      $("editMessage").textContent =
        "生きものの名前を入力してください。";

      return;
    }

    if (!date || !time) {
      $("editMessage").textContent =
        "観察日と観察時刻を選択してください。";

      return;
    }

    const updated = {
      name,
      category: $("editCategory").value || "その他",
      observed_on: date,
      observed_at: dateTimeToISO(`${date}T${time}`),
      place: $("editPlace").value.trim(),
      notes: $("editNotes").value.trim(),
      confirmed: $("editConfirmed").checked
    };

    const saveButton = $("editSave");

    saveButton.disabled = true;
    saveButton.textContent = "保存しています…";

    $("editMessage").textContent = "";

    let newImagePath = null;

    try {
      /*
       * 新しい写真が選択されている場合だけアップロードする。
       */
      if (replacementPhotoFile && replacementPhotoData) {
        const blob = await (
          await fetch(replacementPhotoData)
        ).blob();

        newImagePath =
          `${family.id}/${user.id}/${crypto.randomUUID()}.jpg`;

        const { error: uploadError } = await sb.storage
          .from("observation-photos")
          .upload(newImagePath, blob, {
            contentType: "image/jpeg"
          });

        if (uploadError) throw uploadError;

        updated.image_path = newImagePath;
      }

      const { error: updateError } = await sb
        .from("observations")
        .update(updated)
        .eq("id", id)
        .eq("family_id", family.id);

      if (updateError) throw updateError;

      /*
       * データベースの更新に成功した後で旧写真を削除する。
       * 新しい写真がない場合は旧写真を残す。
       */
      if (newImagePath && record.image_path) {
        const { error: removeError } = await sb.storage
          .from("observation-photos")
          .remove([record.image_path]);

        if (removeError) {
          console.warn(
            "旧写真の削除に失敗しました",
            removeError.message
          );
        }
      }

      closeModal();

      await loadRecords();

      alert("観察記録を更新しました！");
    } catch (error) {
      /*
       * 更新に失敗した場合、今回アップロードした写真を削除する。
       */
      if (newImagePath) {
        await sb.storage
          .from("observation-photos")
          .remove([newImagePath]);
      }

      $("editMessage").textContent =
        `更新できませんでした：${error.message}`;

      saveButton.disabled = false;
      saveButton.textContent = "変更を保存";
    }
  };
}

/*
 * 検索・分類フィルター・再読み込み
 */
$("searchInput").oninput = renderRecords;
$("filterCategory").onchange = renderRecords;
$("refreshBtn").onclick = loadRecords;

/*
 * Service Workerの登録
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

/*
 * アプリ起動
 */
init();
