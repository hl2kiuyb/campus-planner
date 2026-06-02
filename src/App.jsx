import { useEffect, useMemo, useState } from "react";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import Moon from "lucide-react/dist/esm/icons/moon.js";
import Pencil from "lucide-react/dist/esm/icons/pencil.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import Save from "lucide-react/dist/esm/icons/save.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Sun from "lucide-react/dist/esm/icons/sun.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import X from "lucide-react/dist/esm/icons/x.js";

const STORAGE_KEYS = {
  theme: "campus-planner-theme",
  filters: "campus-planner-filters",
  sort: "campus-planner-sort",
  draft: "campus-planner-draft",
};

const TYPE_LABELS = {
  assignment: "과제",
  exam: "시험",
  event: "일정",
  memo: "메모",
};

const STATUS_LABELS = {
  todo: "예정",
  in_progress: "진행",
  done: "완료",
};

const PRIORITY_LABELS = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

const EMPTY_FORM = {
  title: "",
  type: "assignment",
  course: "",
  due_date: "",
  priority: "medium",
  status: "todo",
  memo: "",
};

function readStorage(key, fallback, storage = localStorage) {
  try {
    const saved = storage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value, storage = localStorage) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing or locked-down browsers.
  }
}

function toInputDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) {
    return "마감 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isDueSoon(item) {
  if (!item.due_date || item.status === "done") {
    return false;
  }

  const now = Date.now();
  const due = new Date(item.due_date).getTime();
  return due >= now && due - now <= 1000 * 60 * 60 * 24 * 3;
}

function buildPayload(form) {
  return {
    ...form,
    title: form.title.trim(),
    course: form.course.trim(),
    memo: form.memo.trim(),
    due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
  };
}

function sortItems(items, sortMode) {
  return [...items].sort((a, b) => {
    if (sortMode === "priority") {
      const score = { high: 0, medium: 1, low: 2 };
      return score[a.priority] - score[b.priority];
    }

    if (sortMode === "created") {
      return new Date(b.created_at) - new Date(a.created_at);
    }

    if (!a.due_date && !b.due_date) {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (!a.due_date) {
      return 1;
    }
    if (!b.due_date) {
      return -1;
    }
    return new Date(a.due_date) - new Date(b.due_date);
  });
}

export default function App() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(() =>
    readStorage(STORAGE_KEYS.filters, {
      search: "",
      type: "all",
      status: "all",
      priority: "all",
    }),
  );
  const [sortMode, setSortMode] = useState(() => readStorage(STORAGE_KEYS.sort, "due"));
  const [theme, setTheme] = useState(() => readStorage(STORAGE_KEYS.theme, "light"));
  const [form, setForm] = useState(() => readStorage(STORAGE_KEYS.draft, EMPTY_FORM, sessionStorage));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStorage(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.filters, filters);
  }, [filters]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.sort, sortMode);
  }, [sortMode]);

  useEffect(() => {
    if (!editingId) {
      writeStorage(STORAGE_KEYS.draft, form, sessionStorage);
    }
  }, [editingId, form]);

  const loadItems = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/items");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "목록을 불러오지 못했습니다.");
      }

      setItems(data.items);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const searchText = filters.search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const searchable = `${item.title} ${item.course} ${item.memo}`.toLowerCase();
      const matchesSearch = !searchText || searchable.includes(searchText);
      const matchesType = filters.type === "all" || item.type === filters.type;
      const matchesStatus = filters.status === "all" || item.status === filters.status;
      const matchesPriority = filters.priority === "all" || item.priority === filters.priority;
      return matchesSearch && matchesType && matchesStatus && matchesPriority;
    });

    return sortItems(filtered, sortMode);
  }, [filters, items, sortMode]);

  const stats = useMemo(() => {
    const openItems = items.filter((item) => item.status !== "done");
    return {
      total: items.length,
      open: openItems.length,
      done: items.filter((item) => item.status === "done").length,
      dueSoon: items.filter(isDueSoon).length,
    };
  }, [items]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    sessionStorage.removeItem(STORAGE_KEYS.draft);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch(editingId ? `/api/items/${editingId}` : "/api/items", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      setItems((current) => {
        if (editingId) {
          return current.map((item) => (item.id === editingId ? data.item : item));
        }
        return [data.item, ...current];
      });
      resetForm();
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      type: item.type,
      course: item.course || "",
      due_date: toInputDateTime(item.due_date),
      priority: item.priority,
      status: item.status,
      memo: item.memo || "",
    });
  };

  const toggleDone = async (item) => {
    const nextStatus = item.status === "done" ? "todo" : "done";
    setError("");

    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "상태 변경에 실패했습니다.");
      }

      setItems((current) => current.map((entry) => (entry.id === item.id ? data.item : entry)));
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  const deleteItem = async (itemId) => {
    setError("");

    try {
      const response = await fetch(`/api/items/${itemId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "삭제에 실패했습니다.");
      }

      setItems((current) => current.filter((item) => item.id !== itemId));
      if (editingId === itemId) {
        resetForm();
      }
    } catch (apiError) {
      setError(apiError.message);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">INU Web Programming</p>
          <h1>Campus Planner</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={loadItems} title="새로고침">
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            title="테마 변경"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <section className="stats-grid" aria-label="플래너 요약">
        <div className="stat-panel">
          <span>전체</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-panel">
          <span>진행</span>
          <strong>{stats.open}</strong>
        </div>
        <div className="stat-panel">
          <span>임박</span>
          <strong>{stats.dueSoon}</strong>
        </div>
        <div className="stat-panel accent">
          <span>완료</span>
          <strong>{stats.done}</strong>
        </div>
      </section>

      <section className="toolbar" aria-label="필터">
        <label className="search-field">
          <Search size={18} />
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="강의명, 제목, 메모 검색"
          />
        </label>

        <div className="segmented">
          <button
            type="button"
            className={filters.status === "all" ? "active" : ""}
            onClick={() => setFilters((current) => ({ ...current, status: "all" }))}
          >
            전체
          </button>
          <button
            type="button"
            className={filters.status === "todo" ? "active" : ""}
            onClick={() => setFilters((current) => ({ ...current, status: "todo" }))}
          >
            예정
          </button>
          <button
            type="button"
            className={filters.status === "done" ? "active" : ""}
            onClick={() => setFilters((current) => ({ ...current, status: "done" }))}
          >
            완료
          </button>
        </div>

        <label className="select-field">
          <span>유형</span>
          <select
            value={filters.type}
            onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
          >
            <option value="all">전체</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="select-field">
          <span>정렬</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            <option value="due">마감순</option>
            <option value="priority">중요도순</option>
            <option value="created">최근순</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </section>

      {error && <p className="error-banner">{error}</p>}

      <section className="workspace">
        <div className="planner-list" aria-live="polite">
          {loading ? (
            <div className="empty-state">불러오는 중</div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">표시할 일정이 없습니다</div>
          ) : (
            filteredItems.map((item) => (
              <article key={item.id} className={`item-card priority-${item.priority}`}>
                <div className="item-main">
                  <div className="item-title-row">
                    <span className={`type-chip ${item.type}`}>{TYPE_LABELS[item.type]}</span>
                    {isDueSoon(item) && <span className="due-chip">임박</span>}
                    <h2>{item.title}</h2>
                  </div>
                  <div className="item-meta">
                    <span>{item.course || "공통"}</span>
                    <span>{formatDate(item.due_date)}</span>
                    <span>{PRIORITY_LABELS[item.priority]}</span>
                    <span>{STATUS_LABELS[item.status]}</span>
                  </div>
                  {item.memo && <p>{item.memo}</p>}
                </div>
                <div className="item-actions">
                  <button
                    className={`icon-button ${item.status === "done" ? "complete" : ""}`}
                    type="button"
                    onClick={() => toggleDone(item)}
                    title={item.status === "done" ? "완료 취소" : "완료"}
                  >
                    <Check size={17} />
                  </button>
                  <button className="icon-button" type="button" onClick={() => startEdit(item)} title="수정">
                    <Pencil size={17} />
                  </button>
                  <button className="icon-button danger" type="button" onClick={() => deleteItem(item.id)} title="삭제">
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <form className="editor-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingId ? "Edit" : "New"}</p>
              <h2>{editingId ? "항목 수정" : "새 항목"}</h2>
            </div>
            {editingId ? (
              <button className="icon-button" type="button" onClick={resetForm} title="취소">
                <X size={18} />
              </button>
            ) : (
              <span className="panel-icon">
                <Plus size={18} />
              </span>
            )}
          </div>

          <label className="field">
            <span>제목</span>
            <input
              required
              maxLength={120}
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              placeholder="예: 웹프로그래밍 발표 영상"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>유형</span>
              <select value={form.type} onChange={(event) => updateForm("type", event.target.value)}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>중요도</span>
              <select value={form.priority} onChange={(event) => updateForm("priority", event.target.value)}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>강의</span>
            <input
              maxLength={80}
              value={form.course}
              onChange={(event) => updateForm("course", event.target.value)}
              placeholder="예: 웹프로그래밍"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>마감</span>
              <input
                type="datetime-local"
                value={form.due_date}
                onChange={(event) => updateForm("due_date", event.target.value)}
              />
            </label>
            <label className="field">
              <span>상태</span>
              <select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>메모</span>
            <textarea
              rows="5"
              maxLength={600}
              value={form.memo}
              onChange={(event) => updateForm("memo", event.target.value)}
              placeholder="핵심 준비물이나 발표 순서를 적어두세요"
            />
          </label>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={resetForm}>
              <X size={17} />
              비우기
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              <Save size={17} />
              {saving ? "저장 중" : "저장"}
            </button>
          </div>

          <div className="storage-note">
            <CalendarDays size={16} />
            <span>테마와 필터는 localStorage, 작성 초안은 sessionStorage에 저장됩니다.</span>
          </div>
        </form>
      </section>
    </main>
  );
}
