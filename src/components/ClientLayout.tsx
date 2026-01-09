"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import ScrollWrapper from "@/components/ScrollWrapper";
import { ChevronUp } from "lucide-react";
// import ChatBot from "./ChatBot";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Navbar />
      {children}
      {/* {!open && ( */}
      <ScrollWrapper>
        <ChevronUp className="text-gray-700" size={50} />
      </ScrollWrapper>
      {/* )} */}
      {/* <ChatBot /> */}
      <Footer />
    </>
  );
}
