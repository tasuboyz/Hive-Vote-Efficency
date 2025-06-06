# Hive Curation Efficiency Analyzer

![Hive Logo](https://coin-images.coingecko.com/coins/images/10840/large/logo_transparent_4x.png?1696510797)

## Overview

Hive Curation Efficiency Analyzer is a web tool that helps Hive blockchain curators analyze the effectiveness of their curation votes. It calculates metrics such as efficiency percentage, APR (Annual Percentage Rate), and total rewards to help curators optimize their curation strategy.

## Features

- **Curation Analysis**: Analyze the efficiency of your curation votes over the past week
- **APR Calculation**: Estimate your annual return rate based on current curation rewards
- **Detailed Statistics**: View metrics including:
  - Average efficiency percentage
  - Best vote efficiency
  - Total HP (Hive Power) earned
  - Number of votes analyzed
  - Estimated APR
- **Sortable Data**: Sort results by any column (author, reward, efficiency, etc.)
- **Advanced Filtering**: Filter results by date range or specific values
- **Responsive Design**: Works on desktop and mobile devices

## How It Works

The tool connects to the Hive blockchain to retrieve your account's curation history. It analyzes your votes from the past week and calculates how efficiently you're earning curation rewards. The efficiency percentage shows how close your actual rewards are to the theoretical maximum rewards you could have earned with perfect timing.

## Getting Started

### Prerequisites

- A web browser with JavaScript enabled
- A Hive account with curation activity

### Usage

1. Open the application in your browser
2. Enter your Hive username in the input field
3. Click "Analyze"
4. Wait for the analysis to complete
5. View your curation statistics and detailed results table

## Installation

If you want to run the application locally:

1. Clone the repository: 
2. Navigate to the project directory:
3. Open `index.html` in your web browser

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Hive Blockchain**: [hive-js library](https://github.com/openhive-network/hive-js)
- **No backend required** - connects directly to Hive blockchain nodes

## Architecture

The application is built with a modular architecture:

- **hiveConnector.js**: Handles blockchain connections with automatic failover between nodes
- **curationCalculator.js**: Core logic for calculating curation efficiency metrics
- **hiveApi.js**: Interface between the UI and blockchain logic
- **ui.js**: Manages the user interface components and updates
- **sorting.js**: Handles the sorting functionality for the results table
- **filters.js**: Implements filtering capabilities for the results table

## Contributing

Contributions are welcome! Feel free to report issues or submit pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.