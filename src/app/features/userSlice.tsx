import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "@/types";

interface UsersState {
  list: User[];
}

const initialState: UsersState = {
  list: [],
};

const usersSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    setUsers(state, action: PayloadAction<User[]>) {
      state.list = action.payload;
    },
    addUser(state, action: PayloadAction<User>) {
      state.list.unshift(action.payload);
    },
    removeUser(state, action: PayloadAction<string>) {
      state.list = state.list.filter((u) => u.id !== action.payload);
    },
  },
});

export const { setUsers, addUser, removeUser } = usersSlice.actions;

export default usersSlice.reducer;
