import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const client = axios.create({ baseURL: BASE, withCredentials: true });

client.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes("/auth/")) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const api = {
  get: (u, params) => client.get(u, { params }).then((r) => r.data),
  post: (u, d) => client.post(u, d).then((r) => r.data),
  put: (u, d) => client.put(u, d).then((r) => r.data),
  del: (u) => client.delete(u).then((r) => r.data),
};

export function apiError(e) {
  const d = e.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
  return e.message || "Something went wrong";
}

export default client;
