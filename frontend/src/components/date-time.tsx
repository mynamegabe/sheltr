"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DateTimePickerProps {
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  time: string
  setTime: (time: string) => void
}

export function DateTimePicker({ date, setDate, time, setTime }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex flex-col gap-3 w-full">
        <Label htmlFor="date-picker" className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Date
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              id="date-picker"
              className="w-full justify-between font-normal text-sm"
            >
              {date ? date.toLocaleDateString() : "Select date"}
              <ChevronDownIcon className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              captionLayout="dropdown"
              onSelect={(date) => {
                setDate(date)
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-col gap-3 w-full">
        <Label htmlFor="time-picker" className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Time
        </Label>
        <Input
          type="time"
          id="time-picker"
          step="1"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none w-full"
        />
      </div>
    </div>
  )
}
