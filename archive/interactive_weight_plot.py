import pandas as pd
import matplotlib
matplotlib.use('TkAgg')  # Use TkAgg backend for tkinter
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.widgets import Button
import numpy as np
from datetime import datetime
import sys

class InteractiveWeightPlot:
    def __init__(self):
        # Read the CSV file
        self.df = pd.read_csv('chart.csv')

        # Parse the DateTime column
        self.df['DateTime'] = pd.to_datetime(self.df['DateTime'])

        # Ignore the first datapoint (header row)
        self.df = self.df.iloc[1:].reset_index(drop=True)

        # Ensure we have proper datetime index
        self.df = self.df.set_index('DateTime')

        # Add week number starting from Monday
        self.df['Week'] = self.df.index.to_period('W-MON')

        # Calculate weekly averages
        self.weekly_avg = self.df.groupby('Week')['Daily Average'].mean()

        # Get week start dates for each week
        self.week_starts = self.weekly_avg.index.to_timestamp()

        # Initialize trend line variables
        self.trend_start_idx = None
        self.trend_end_idx = None
        self.trend_line = None
        self.trend_text = None

        # Visual feedback for selected points
        self.start_marker = None
        self.end_marker = None
        self.point_colors = None  # Will be initialized after week_starts is available

        # Create the plot
        self.setup_plot()

    def setup_plot(self):
        """Set up the matplotlib figure and plot"""
        self.fig, self.ax = plt.subplots(figsize=(12, 8))

        # Pick a categorical color palette (handle up to 20 weeks)
        color_palette = plt.get_cmap('tab20')
        unique_weeks = sorted(self.df['Week'].unique())
        week_to_color = {week: color_palette(i % 20) for i, week in enumerate(unique_weeks)}

        # Assign a color to each row for its week
        self.df['Color'] = self.df['Week'].map(week_to_color)
        # For weekly averages: use color for that week
        weekly_colors = [week_to_color[week] for week in self.weekly_avg.index]

        # Plot individual data points, colored by week
        self.ax.scatter(self.df.index, self.df['Daily Average'],
                       color=self.df['Color'], s=30, alpha=0.7, label='Daily Weight')

        # Plot weekly averages as bigger dots using matching colors
        self.weekly_scatter = self.ax.scatter(self.week_starts, self.weekly_avg.values,
                                             c=weekly_colors, s=60, zorder=5, label='Weekly Average')

        # Draw lines between weekly averages (keep a single color for clarity)
        self.weekly_line, = self.ax.plot(self.week_starts, self.weekly_avg.values,
                                       color='gray', linewidth=2, alpha=0.7, zorder=4)

        # Store for potential downstream usage
        self.point_colors = list(weekly_colors)
        self.week_colors = list(weekly_colors)  # <-- Save the canonical color mapping

        # Add vertical lines for each week boundary
        for week_start in self.week_starts:
            self.ax.axvline(x=week_start, color='gray', linestyle='--', alpha=0.3)

        # Format the plot
        self.ax.set_title('Weight Tracking with Interactive Trend Line', fontsize=14, fontweight='bold')
        self.ax.set_xlabel('Date', fontsize=12)
        self.ax.set_ylabel('Weight (kg)', fontsize=12)
        self.ax.legend()
        self.ax.grid(True, alpha=0.3)

        # Format x-axis dates
        self.ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        self.ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
        plt.setp(self.ax.xaxis.get_majorticklabels(), rotation=45)

        # Connect mouse events
        self.fig.canvas.mpl_connect('button_press_event', self.on_click)
        # Removed motion_notify_event and button_release_event connections (dragging endpoints no longer supported)

        # Add instructions
        self.add_instructions()

        plt.tight_layout()
        plt.show()

    def add_instructions(self):
        """Add instruction text to the plot"""
        instructions = ("Instructions:\n"
                       "• Left-click on weekly average points to set trend line\n"
                       "• Right-click to reset/clear trend line\n"
                       "• Trend line will snap to weekly averages")

        self.ax.text(0.02, 0.98, instructions, transform=self.ax.transAxes,
                    fontsize=10, verticalalignment='top',
                    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

    def find_closest_week_index(self, x_coord):
        """Find the closest weekly average point to the given x coordinate"""
        if len(self.week_starts) == 0:
            return None

        # Convert x coordinate to datetime if it's not already
        if isinstance(x_coord, (int, float)):
            x_coord = mdates.num2date(x_coord)

        # Make sure both datetimes are timezone-naive for comparison
        if hasattr(x_coord, 'tzinfo') and x_coord.tzinfo is not None:
            x_coord = x_coord.replace(tzinfo=None)

        # Find the closest week start date
        distances = []
        for week_start in self.week_starts:
            # Ensure week_start is also timezone-naive
            if hasattr(week_start, 'tzinfo') and week_start.tzinfo is not None:
                week_start = week_start.replace(tzinfo=None)
            distances.append(abs((x_coord - week_start).total_seconds()))

        closest_idx = distances.index(min(distances))
        return closest_idx

    def on_click(self, event):
        """Handle mouse click events"""
        if event.inaxes != self.ax:
            return

        if event.button == 1:  # Left click
            # Find closest weekly average point
            closest_idx = self.find_closest_week_index(event.xdata)
            if closest_idx is None:
                return

            if self.trend_start_idx is None:
                # Set start point
                self.trend_start_idx = closest_idx
                self.highlight_point(closest_idx, 'green')
                print(f"Trend line start set to Week {closest_idx}: {self.weekly_avg.index[closest_idx]} → {self.weekly_avg.iloc[closest_idx]:.2f} kg")
            elif self.trend_end_idx is None:
                # Set end point
                self.trend_end_idx = closest_idx
                self.highlight_point(closest_idx, 'green')
                print(f"Trend line end set to Week {closest_idx}: {self.weekly_avg.index[closest_idx]} → {self.weekly_avg.iloc[closest_idx]:.2f} kg")
                self.draw_trend_line()
            else:
                # Reset and start over
                self.clear_trend_line()
                self.trend_start_idx = closest_idx
                self.trend_end_idx = None  # Reset end point
                self.highlight_point(closest_idx, 'green')
                print(f"Reset: Trend line start set to Week {closest_idx}: {self.weekly_avg.index[closest_idx]} → {self.weekly_avg.iloc[closest_idx]:.2f} kg")

        elif event.button == 3:  # Right click
            # Reset trend line
            self.clear_trend_line()
            self.trend_start_idx = None
            self.trend_end_idx = None
            print("Trend line cleared (right-click)")

    def on_motion(self, event):
        """Handle mouse motion events for dragging"""
        # Functionality removed (dragging endpoints no longer supported)
        pass

    def on_release(self, event):
        """Handle mouse release events"""
        # Functionality removed (dragging endpoints no longer supported)
        pass

    def draw_trend_line(self):
        """Draw or update the trend line"""
        if self.trend_start_idx is None or self.trend_end_idx is None:
            return

        # Clear existing trend line
        self.clear_trend_line()

        # Ensure start is before end
        if self.trend_start_idx > self.trend_end_idx:
            self.trend_start_idx, self.trend_end_idx = self.trend_end_idx, self.trend_start_idx

        start_week = self.weekly_avg.index[self.trend_start_idx]
        end_week = self.weekly_avg.index[self.trend_end_idx]
        start_weight = self.weekly_avg.iloc[self.trend_start_idx]
        end_weight = self.weekly_avg.iloc[self.trend_end_idx]

        # Calculate statistics
        num_weeks = self.trend_end_idx - self.trend_start_idx
        weekly_change = (end_weight - start_weight) / num_weeks if num_weeks > 0 else 0

        # Draw trend line
        self.trend_line, = self.ax.plot(
            [self.week_starts[self.trend_start_idx], self.week_starts[self.trend_end_idx]],
            [start_weight, end_weight],
            'g--', linewidth=3, alpha=0.8, label=f'Trend Line ({num_weeks} weeks)'
        )

        # Add statistics text at fixed position (top right of plot)
        stats_text = (f"Start: {start_weight:.2f} kg\n"
                     f"End: {end_weight:.2f} kg\n"
                     f"Change: {end_weight - start_weight:.2f} kg\n"
                     f"Weekly: {weekly_change:.2f} kg/week")

        # Position the stats box at a fixed location (top left, below instructions)
        x_pos = 0.02  # Left side of plot
        y_pos = 0.75  # Below the instructions box

        self.trend_text = self.ax.text(x_pos, y_pos, stats_text,
                                      transform=self.ax.transAxes,
                                      fontsize=10, ha='left', va='top',
                                      bbox=dict(boxstyle='round', facecolor='lightgreen', alpha=0.8))

        # Print detailed statistics
        self.print_trend_stats(start_week, end_week, start_weight, end_weight, weekly_change, num_weeks)

        # Update legend
        self.ax.legend()
        self.fig.canvas.draw()

    def highlight_point(self, idx, color='green'):
        """Change the color of a specific weekly average point temporarily (e.g. for highlight)"""
        # Change color at idx, keep others as is
        self.point_colors[idx] = color
        self.weekly_scatter.set_color(self.point_colors)
        self.fig.canvas.draw()

    def reset_point_colors(self):
        """Reset all weekly average points to their canonical week color"""
        self.point_colors = list(self.week_colors)
        self.weekly_scatter.set_color(self.point_colors)
        self.fig.canvas.draw()

    def clear_trend_line(self):
        """Clear the existing trend line, text, and reset colors"""
        if self.trend_line:
            self.trend_line.remove()
            self.trend_line = None
        if self.trend_text:
            self.trend_text.remove()
            self.trend_text = None
        if self.start_marker:
            self.start_marker.remove()
            self.start_marker = None
        if self.end_marker:
            self.end_marker.remove()
            self.end_marker = None

        # Reset all point colors to red
        self.reset_point_colors()

    def print_trend_stats(self, start_week, end_week, start_weight, end_weight, weekly_change, num_weeks):
        """Print detailed trend statistics to console"""
        print(f"\n{'='*60}")
        print(f"TREND LINE ANALYSIS")
        print(f"{'='*60}")
        print(f"Start Week:      {start_week}")
        print(f"Starting Weight: {start_weight:.2f} kg")
        print(f"End Week:        {end_week}")
        print(f"Ending Weight:   {end_weight:.2f} kg")
        print(f"Total Change:    {end_weight - start_weight:.2f} kg")
        print(f"Weekly Change:   {weekly_change:.2f} kg/week")
        print(f"Duration:        {num_weeks} weeks")
        print(f"{'='*60}\n")

def main():
    print("Starting Interactive Weight Plot...")
    print("Click on weekly average points to create trend lines!")

    # Create and show the interactive plot
    plot = InteractiveWeightPlot()

    # Keep the plot open
    plt.show()

if __name__ == "__main__":
    main()
