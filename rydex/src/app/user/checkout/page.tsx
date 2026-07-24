import CheckOutContent from "@/components/CheckOutContent";
import React, { Suspense } from "react";

function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CheckOutContent />
    </Suspense>
  );
}

export default Page;
