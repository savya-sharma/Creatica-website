"use client";

import { useState } from "react";
import ClientDirectoryItem from "./ClientDirectoryItem";
import { CLIENTS } from "@/data/connect";

// The clients we've worked with, as an editorial index: numbered rows that
// open one at a time to show each client's profiles. Opening one closes the
// one before; opening the open one again closes it.
export default function ClientDirectory() {
  const [openId, setOpenId] = useState(null);
  return (
    <ol className="client-directory">
      {CLIENTS.map((client, index) => (
        <ClientDirectoryItem
          key={client.id}
          client={client}
          index={index}
          open={openId === client.id}
          onToggle={() => setOpenId((current) => (current === client.id ? null : client.id))}
        />
      ))}
    </ol>
  );
}
