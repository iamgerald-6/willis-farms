import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { persistStore, persistReducer } from "redux-persist";
import storageSession from "redux-persist/lib/storage/session";

import authReducer from "../features/authSlice";
import uiReducer from "../features/userSlice";
const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
});

const persistConfig = {
  key: "will_root",
  storage: storageSession,
  whitelist: ["auth", "ui"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // required for redux-persist
    }),
});

export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
