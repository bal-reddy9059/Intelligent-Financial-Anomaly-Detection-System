import { useNavigate, useLocation } from "react-router-dom";
import { Check } from "lucide-react";

const STEPS = [
  { label: "Upload",  path: "/upload-data" },
  { label: "Explore", path: "/explore-data" },
  { label: "Detect",  path: "/run-detection" },
  { label: "Results", path: "/detection-results" },
  { label: "Compare", path: "/model-comparison" },
  { label: "Check",   path: "/check-transaction" },
  { label: "Batch",   path: "/batch-check" },
  { label: "AI Hub",  path: "/ai-hub" },
  { label: "Features", path: "/feature-insights" },
];

export default function MLWorkflowStepper() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentIndex = STEPS.findIndex((s) => s.path === location.pathname);

  return (
    <div className="mb-6">
      <div className="flex items-start w-full">
        {STEPS.map((step, i) => {
          const isDone     = i < currentIndex;
          const isActive   = i === currentIndex;

          return (
            <div key={step.path} className="flex flex-col items-center flex-1 min-w-0">
              {/* connector + circle row */}
              <div className="flex items-center w-full">
                {/* left connector */}
                <div className={`flex-1 h-px ${i === 0 ? "opacity-0" : isDone || isActive ? "bg-blue-500/50" : "bg-gray-700"}`} />

                {/* circle */}
                <button
                  onClick={() => navigate(step.path)}
                  title={step.label}
                  className={`
                    flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                    text-xs font-bold transition-all duration-200 border cursor-pointer
                    ${isActive
                      ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/30"
                      : isDone
                      ? "bg-green-500/20 border-green-500 text-green-400 hover:bg-green-500/30"
                      : "bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400"
                    }
                  `}
                >
                  {isDone ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                </button>

                {/* right connector */}
                <div className={`flex-1 h-px ${i === STEPS.length - 1 ? "opacity-0" : isDone ? "bg-blue-500/50" : "bg-gray-700"}`} />
              </div>

              {/* label */}
              <span className={`mt-1.5 text-center leading-tight px-0.5
                ${isActive   ? "text-blue-400 font-semibold" :
                  isDone     ? "text-green-400" :
                               "text-gray-600"}
                text-[10px] hidden sm:block truncate w-full`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
