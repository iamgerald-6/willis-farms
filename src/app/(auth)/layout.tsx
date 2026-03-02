import "../../app/globals.css";

// import ClientLayout from "@/components/ClientLayout";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* <Navbar /> */}
        <main>{children}</main>
        {/* <Footer /> */}
      </body>
    </html>
  );
}
