import React, { ReactNode } from "react";

export type TimelineItem = {
  title: string;
  description: string;
  icon?: ReactNode; // optional icon to show on timeline
  color?: string; // optional color for the icon circle
};

interface TimelineProps {
  events: TimelineItem[];
}

const Timeline: React.FC<TimelineProps> = ({ events }) => {
  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-5 top-0 bottom-0 w-1 bg-gray-300 hidden sm:block" />

      <div className="space-y-8">
        {events.map((event, index) => (
          <div
            key={index}
            className="relative flex flex-col sm:flex-row sm:items-start"
          >
            {/* Timeline Icon */}
            <div
              className={`flex-shrink-0 flex justify-center  w-10 h-10 rounded-full border-2 border-gray-300 
                            ${event.color} items-center text-center `}
            >
              {event.icon}
            </div>

            {/* Content */}
            <div className="mt-3 sm:mt-0 sm:ml-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {event.title}
              </h3>
              <p className="mt-1 text-gray-600 whitespace-pre-line">
                {event.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
