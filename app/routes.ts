import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("crm", "routes/crm-dashboard.tsx"),
  route("crm/search", "routes/crm-search.tsx"),
  route("crm/tasks", "routes/tasks.tsx"),
  route("crm/notifications", "routes/notifications.tsx"),
  route("crm/history", "routes/audit-history.tsx"),
  route("crm/archive", "routes/crm-archive.tsx"),
  route("crm/contacts/new", "routes/contact-new.tsx"),
  route("crm/contacts/:contactId", "routes/contact-detail.tsx"),
  route("crm/contacts/:contactId/relations", "routes/contact-relations.tsx"),
  route("crm/contacts/:contactId/associations", "routes/contact-associations.tsx"),
  route("crm/contacts/:contactId/collaboration", "routes/contact-collaboration.tsx"),
  route("crm/organizations", "routes/organizations.tsx"),
  route("crm/organizations/:organizationId", "routes/organization-detail.tsx"),
  route("properties", "routes/properties.tsx"),
  route("properties/new", "routes/property-new.tsx"),
  route("properties/:propertyId", "routes/property-detail.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
