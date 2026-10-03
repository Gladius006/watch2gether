import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Watch2Gether — Your shared movie night",description:"Watch Google Drive videos together. Create a room, invite your people, and enjoy synchronized playback.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="en"><body>{children}</body></html>;}

