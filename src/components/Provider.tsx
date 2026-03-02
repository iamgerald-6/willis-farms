"use client";

import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "@/app/store/index";
import { ReactNode, useEffect, useState } from "react";

export default function ReduxProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Provider store={store}>
      {mounted ? (
        <PersistGate persistor={persistor} loading={null}>
          {children}
        </PersistGate>
      ) : null}
    </Provider>
  );
}
