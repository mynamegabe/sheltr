import React, { useState } from 'react';
import { useGeolocated } from "react-geolocated";
import { AlertCircle, Loader2, TriangleAlert, Ban, Users, XCircle, Footprints, Accessibility, ArrowUpFromDot, Grid2X2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from "sonner"
import axios from 'axios';

export interface Report {
    id: string;
    type: string;
    label: string;
    timestamp: number;
    confirmations: number;
    denials: number;
    coordinates: [number, number]; // [lng, lat]
    details?: string;
}

export const REPORT_TYPES = [
    { type: 'obstacle', label: 'Obstacle', icon: TriangleAlert, color: '#f59e0b' },
    { type: 'broken-lift', label: 'Broken Lift', icon: XCircle, color: '#ef4444' },
    { type: 'ramp-blocked', label: 'Ramp Blocked', icon: Ban, color: '#f97316' },
    { type: 'very-crowded', label: 'Crowd', icon: Users, color: '#8b5cf6' },
    // New Accessibility Types
    { type: 'accessible-path', label: 'Accessible Path', icon: Footprints, color: '#10b981' }, // Green
    { type: 'ramp', label: 'Ramp Available', icon: Accessibility, color: '#3b82f6' }, // Blue
    { type: 'elevator', label: 'Elevator Working', icon: ArrowUpFromDot, color: '#0ea5e9' }, // Sky
    { type: 'tactile-paving', label: 'Tactile Paving', icon: Grid2X2, color: '#d946ef' }, // Fuschia
];

interface ReportButtonProps {
    reports: Report[];
    onReportsChange: (reports: Report[]) => void;
}

const ReportButton: React.FC<ReportButtonProps> = ({ reports, onReportsChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedReportType, setSelectedReportType] = useState<typeof REPORT_TYPES[0] | null>(null);
    const [reportDetails, setReportDetails] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const {
        coords,
        isGeolocationAvailable,
        isGeolocationEnabled,
        positionError,
    } = useGeolocated({
        positionOptions: {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 5000,
        },
        userDecisionTimeout: 5000,
    });

    const userLocation: [number, number] | null = coords
        ? [coords.longitude, coords.latitude]
        : null;

    const getLocationError = () => {
        if (!isGeolocationAvailable) return 'Geolocation is not supported by your browser';
        if (!isGeolocationEnabled) return 'Geolocation is not enabled';
        if (positionError) return positionError.message || 'Unable to get location';
        return null;
    };

    const locationError = getLocationError();
    const isLocating = !userLocation && !locationError;


    const openReportDialog = (type: typeof REPORT_TYPES[0]) => {
        if (!userLocation) {
            toast.error('Location required', {
                description: 'Please enable location access to report an issue.',
            });
            return;
        }
        setSelectedReportType(type);
        setReportDetails('');
        setDialogOpen(true);
        setIsOpen(false);
    };

    const handleSubmitReport = async () => {
        if (!userLocation || !selectedReportType) return;
        setSubmitting(true);

        try {
            const reportData = {
                type: selectedReportType.type,
                label: selectedReportType.label,
                coordinates: userLocation,
                details: reportDetails.trim() || undefined,
                timestamp: Date.now(),
            };

            const response = await axios.post('/api/reports', reportData);
            const newReport = response.data;

            onReportsChange([...reports, newReport]);

            toast('Report submitted', {
                description: `${selectedReportType.label} has been reported at your location.`,
            });

            setDialogOpen(false);
            setSelectedReportType(null);
            setReportDetails('');

        } catch (error) {
            console.error("Failed to submit report", error);
            toast.error("Submission failed", {
                description: "Could not submit report to server."
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* Report Button */}
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="default"
                        size="icon"
                        className="h-12 w-12 rounded-full shadow-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
                    >
                        <AlertCircle className="w-6 h-6" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-64 p-2"
                    side="top"
                    align="end"
                    sideOffset={8}
                >
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                            Report accessibility issue
                        </p>

                        {isLocating ? (
                            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Getting your location...</span>
                            </div>
                        ) : locationError ? (
                            <div className="px-3 py-3 space-y-2">
                                <p className="text-sm text-destructive">{locationError}</p>
                            </div>
                        ) : userLocation ? (
                            <>
                                <p className="text-xs text-muted-foreground px-2 pb-1">
                                    📍 Location acquired
                                </p>
                                {REPORT_TYPES.map((type) => (
                                    <button
                                        key={type.type}
                                        onClick={() => openReportDialog(type)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
                                    >
                                        <span className="text-lg"><type.icon className="w-5 h-5" style={{ color: type.color }} /></span>
                                        <span>Report {type.label}</span>
                                    </button>
                                ))}
                            </>
                        ) : null}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Report Details Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {selectedReportType && (
                                <>
                                    <span className="text-2xl">
                                        <selectedReportType.icon className="w-6 h-6" style={{ color: selectedReportType.color }} />
                                    </span>
                                    Report {selectedReportType.label}
                                </>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="details">Details (optional)</Label>
                            <Textarea
                                id="details"
                                placeholder="Add any additional details about this issue..."
                                value={reportDetails}
                                onChange={(e) => setReportDetails(e.target.value)}
                                className="min-h-[100px]"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            📍 Your current location will be used for this report
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmitReport} disabled={submitting}>
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Report"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default ReportButton;