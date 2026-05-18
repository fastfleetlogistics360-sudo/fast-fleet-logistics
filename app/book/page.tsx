import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking/booking-flow";

export const metadata: Metadata = {
  title: "Book Delivery"
};

export default function BookPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
      <BookingFlow />
    </section>
  );
}
