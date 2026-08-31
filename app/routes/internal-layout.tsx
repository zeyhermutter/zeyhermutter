import { Outlet } from "react-router";
import { PersistentNavigation } from "~/components/persistent-navigation";

export default function InternalLayout() {
  return (
    <div className="persistent-app-frame">
      <PersistentNavigation />
      <div className="persistent-app-main">
        <Outlet />
      </div>
    </div>
  );
}
