import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("crm", "routes/crm.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
