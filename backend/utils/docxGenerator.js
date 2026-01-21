/**
 * DOCX Generator for Dashboard Agent
 * Generates Word documents from Dashboard Template data
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import fs from 'fs';
import path from 'path';

/**
 * Generate DOCX document from Dashboard Template
 * @param {Object} template - DashboardTemplate object
 * @param {string} outputPath - Full path where DOCX should be saved
 * @returns {Promise<void>}
 */
export async function generateDashboardDocx(template, outputPath) {
    const children = [];

    // =========================================================
    // COVER PAGE
    // =========================================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: 'PEPPER – CASE DASHBOARD MASTER DOCUMENT',
                    bold: true,
                    size: 32,
                }),
            ],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: 'Generated automatically by Pepper.',
                    italics: true,
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: '⚠️ IMPORTANT: Do not edit this document manually.',
                    bold: true,
                    color: 'FF0000',
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: 'To update this case, please use Pepper again. Do not modify the Word document manually, because the Dashboard may stop working.',
                    italics: true,
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
        }),
        new Paragraph({
            text: '',
            spacing: { after: 400 },
        }),
    );

    // =========================================================
    // SECTION 1 — CASE INFORMATION
    // =========================================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: 'SECTION 1 — CASE INFORMATION',
                    bold: true,
                    size: 28,
                }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 300 },
        }),
    );

    // Create table for case information
    const caseInfoRows = [
        new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: 'Field', bold: true })] })],
                    width: { size: 40, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: 'Value', bold: true })] })],
                    width: { size: 60, type: WidthType.PERCENTAGE },
                }),
            ],
        }),
        createTableRow('Case ID (numeric)', template.case_id || 'Not provided.'),
        createTableRow('Court / Judicial Office', template.court || 'Not provided.'),
        createTableRow('Plaintiff', template.plaintiff || 'Not provided.'),
        createTableRow('Defendant', template.defendant || 'Not provided.'),
        createTableRow('Last Action', template.last_action || 'Not provided.'),
        createTableRow('Case Name / Client', template.client || 'Not provided.'),
        createTableRow('Practice Area', template.practice || 'Not provided.'),
        createTableRow('Case Type', template.type || 'Not provided.'),
        createTableRow('Assigned Attorney', template.attorney || 'Not provided.'),
        createTableRow('Overall Status', template.status ? `${template.status} (active / pending / urgent)` : 'Not provided.'),
        createTableRow('Stage', template.stage || 'Not provided.'),
        createTableRow('Next Hearing', template.hearing && template.hearing.toLowerCase() !== 'none' ? template.hearing : 'None'),
    ];

    children.push(
        new Table({
            rows: caseInfoRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        new Paragraph({ text: '', spacing: { after: 400 } }),
    );

    // =========================================================
    // SECTION 2 — CASE SUMMARY
    // =========================================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: 'SECTION 2 — CASE SUMMARY',
                    bold: true,
                    size: 28,
                }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 300 },
        }),
        new Paragraph({
            children: [new TextRun({ text: 'Brief Description of the Case:', bold: true })],
            spacing: { after: 200 },
        }),
    );

    // Handle summary text - split long text into multiple paragraphs
    const summaryText = template.summary || 'Not provided.';
    if (summaryText && summaryText !== 'Not provided.') {
        // Maximum characters per paragraph to avoid DOCX issues
        const maxLength = 2000;

        if (summaryText.length > maxLength) {
            // Split into chunks by sentences first, then by words if needed
            const sentences = summaryText.split(/(?<=[.!?])\s+/);
            let currentChunk = '';

            for (const sentence of sentences) {
                const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;

                if (testChunk.length > maxLength && currentChunk.length > 0) {
                    // Add current chunk as a paragraph
                    children.push(
                        new Paragraph({
                            children: [new TextRun({ text: currentChunk.trim() })],
                            spacing: { after: 100 },
                        }),
                    );
                    currentChunk = sentence;
                } else {
                    currentChunk = testChunk;
                }
            }

            // Add remaining chunk
            if (currentChunk.trim().length > 0) {
                children.push(
                    new Paragraph({
                        children: [new TextRun({ text: currentChunk.trim() })],
                        spacing: { after: 400 },
                    }),
                );
            }
        } else {
            // Short summary - single paragraph
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: summaryText })],
                    spacing: { after: 400 },
                }),
            );
        }
    } else {
        children.push(
            new Paragraph({
                children: [new TextRun({ text: 'Not provided.' })],
                spacing: { after: 400 },
            }),
        );
    }

    // =========================================================
    // SECTION 3 — IMPORTANT DATES
    // =========================================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: 'SECTION 3 — IMPORTANT DATES (OPTIONAL)',
                    bold: true,
                    size: 28,
                }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 300 },
        }),
    );

    if (Array.isArray(template.important_dates) && template.important_dates.length > 0) {
        template.important_dates.forEach((date, index) => {
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Title: ${date.title || 'Not provided.'}`, bold: true })],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Date (YYYY-MM-DD): ${date.date || 'Not provided.'}` })],
                    spacing: { after: 200 },
                }),
            );
        });
    } else {
        children.push(
            new Paragraph({
                children: [new TextRun({ text: 'No additional important dates have been recorded.', italics: true })],
                spacing: { after: 400 },
            }),
        );
    }

    // =========================================================
    // SECTION 4 — DEADLINES
    // =========================================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: 'SECTION 4 — DEADLINES',
                    bold: true,
                    size: 28,
                }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 300 },
        }),
    );

    if (Array.isArray(template.deadlines) && template.deadlines.length > 0) {
        template.deadlines.forEach((deadline, index) => {
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Deadline ${index + 1}`, bold: true, size: 24 })],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Title: ${deadline.title || 'Not provided.'}`, bold: true })],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Due Date: ${deadline.due || 'Not provided.'} (YYYY-MM-DD)` })],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Responsible: ${deadline.owner || 'Not provided.'}` })],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `Completed: ${deadline.completed ? 'Yes' : 'No'}` })],
                    spacing: { after: 200 },
                }),
            );
        });
    } else {
        children.push(
            new Paragraph({
                children: [new TextRun({ text: 'There are currently no deadlines registered for this case.', italics: true })],
                spacing: { after: 400 },
            }),
        );
    }

    // =========================================================
    // SECTION 5 — RECENT ACTIVITY LOG
    // =========================================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: 'SECTION 5 — RECENT ACTIVITY LOG',
                    bold: true,
                    size: 28,
                }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 300 },
        }),
    );

    if (Array.isArray(template.recent_activity) && template.recent_activity.length > 0) {
        template.recent_activity.forEach((activity, index) => {
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Activity ${index + 1}`, bold: true, size: 24 })],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `ID: ${activity.id || 'Not provided.'}`, bold: true })],
                    spacing: { after: 100 },
                }),
            );

            // Handle long activity messages - split if needed
            const activityMessage = activity.message || 'Not provided.';
            if (activityMessage.length > 2000) {
                // Split long messages into multiple paragraphs
                const messageChunks = [];
                let currentChunk = '';
                const sentences = activityMessage.split(/(?<=[.!?])\s+/);

                for (const sentence of sentences) {
                    const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
                    if (testChunk.length > 2000 && currentChunk.length > 0) {
                        messageChunks.push(currentChunk.trim());
                        currentChunk = sentence;
                    } else {
                        currentChunk = testChunk;
                    }
                }
                if (currentChunk.trim().length > 0) {
                    messageChunks.push(currentChunk.trim());
                }

                messageChunks.forEach((chunk, idx) => {
                    children.push(
                        new Paragraph({
                            children: [new TextRun({ text: `Message: ${chunk}` })],
                            spacing: { after: idx === messageChunks.length - 1 ? 100 : 50 },
                        }),
                    );
                });
            } else {
                children.push(
                    new Paragraph({
                        children: [new TextRun({ text: `Message: ${activityMessage}` })],
                        spacing: { after: 100 },
                    }),
                );
            }

            children.push(
                new Paragraph({
                    children: [new TextRun({ text: `Timestamp: ${activity.time || 'Not provided.'}` })],
                    spacing: { after: 200 },
                }),
            );
        });
    } else {
        children.push(
            new Paragraph({
                children: [new TextRun({ text: 'No recent activity recorded.', italics: true })],
                spacing: { after: 400 },
            }),
        );
    }

    // =========================================================
    // SECTION 6 — SIDEBAR CASE (REFERENCE FOR DASHBOARD)
    // =========================================================
    if (template.sidebar_case) {
        children.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'SECTION 6 — SIDEBAR CASE (REFERENCE FOR DASHBOARD)',
                        bold: true,
                        size: 28,
                    }),
                ],
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
            }),
        );

        const sidebarRows = [
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: 'Field', bold: true })] })],
                        width: { size: 40, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: 'Value', bold: true })] })],
                        width: { size: 60, type: WidthType.PERCENTAGE },
                    }),
                ],
            }),
            createTableRow('Case ID', template.sidebar_case.id || 'Not provided.'),
            createTableRow('Case Name', template.sidebar_case.name || 'Not provided.'),
            createTableRow('Type', template.sidebar_case.type || 'Not provided.'),
            createTableRow('Status', template.sidebar_case.status || 'Not provided.'),
        ];

        children.push(
            new Table({
                rows: sidebarRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            }),
        );
    }

    // =========================================================
    // CREATE DOCUMENT
    // =========================================================
    const doc = new Document({
        sections: [
            {
                properties: {},
                children: children,
            },
        ],
    });

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        console.log(`[docxGenerator] Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }

    // Generate DOCX file
    console.log(`[docxGenerator] Generating DOCX buffer for file: ${outputPath}`);
    const buffer = await Packer.toBuffer(doc);
    console.log(`[docxGenerator] Buffer generated, size: ${buffer.length} bytes`);
    
    fs.writeFileSync(outputPath, buffer);
    console.log(`[docxGenerator] ✅ DOCX file written successfully: ${outputPath}`);
    
    // Verify file was created
    if (!fs.existsSync(outputPath)) {
        throw new Error(`DOCX file was not created at ${outputPath}`);
    }
    
    const stats = fs.statSync(outputPath);
    console.log(`[docxGenerator] File verified, size: ${stats.size} bytes`);
}

/**
 * Helper function to create a table row
 */
function createTableRow(label, value) {
    return new TableRow({
        children: [
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
                width: { size: 40, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: value || 'Not provided.' })] })],
                width: { size: 60, type: WidthType.PERCENTAGE },
            }),
        ],
    });
}

