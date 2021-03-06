import {Component, Input, OnChanges, ViewEncapsulation} from '@angular/core';
import {Observable} from 'rxjs/Observable';
import {StackAnalysesService} from '../stack-analyses.service';
import {getStackReportModel} from '../utils/stack-api-utils';

import {StackReportModel, ResultInformationModel, UserStackInfoModel, RecommendationsModel, ComponentInformationModel} from '../models/stack-report.model';

@Component({
    selector: 'stack-report-inshort',
    providers: [StackAnalysesService],
    encapsulation: ViewEncapsulation.None,
    styleUrls: ['./stack-report-inshort.component.less'],
    templateUrl: './stack-report-inshort.component.html'
})

export class StackReportInShortComponent implements OnChanges {
    @Input() stackUrl;
    @Input() repoInfo;
    @Input() buildNumber;
    @Input() appName;

    public tabs: Array<any> = [];
    public result: StackReportModel;
    public stackLevel: UserStackInfoModel;
    public recommendations: RecommendationsModel;
    public licenseInfo: any;
    public securityInfo: any;
    public stackLevelOutliers: any;
    public dataLoaded: boolean = false;
    public error: any;
    public licenseOutliers: number = 0;

    private cache: string = '';

    constructor(private stackAnalysisService: StackAnalysesService) {}

    ngOnChanges(): void {
        if (this.stackUrl && this.stackUrl !== this.cache) {
            this.cache = this.stackUrl;
            this.dataLoaded = false;
            this.stackAnalysisService
                .getStackAnalyses(this.stackUrl)
                .subscribe((data) => {
                    if (data && (!data.hasOwnProperty('error') && Object.keys(data).length !== 0)) {
                        let resultInformation: Observable<StackReportModel> = getStackReportModel(data);
                        if (resultInformation) {
                            resultInformation.subscribe((response) => {
                                this.result = response;
                                this.buildReportInShort();
                            });
                        }
                    } else {
                        // Handle Errors here 'API error'
                        this.handleError({
                            title: data.error
                        });
                    }
                }, error => {
                    // Handle server errors here
                    this.handleError({
                        title: 'Something unexpected happened'
                    });
                });
        } else {

        }
    }

    public handleError(error: any): void {
        this.error = error;
        this.dataLoaded = true;
    }

    public tabSelection(tab: any): void {
        tab['active'] = true;
        let currentIndex: number = tab['index'];
        this.stackLevel = tab.content.user_stack_info;
        this.recommendations = tab.content.recommendation;
        if (this.recommendations) {
            this.stackLevelOutliers = {
                'usage': this.recommendations.usage_outliers
            };
        }
        this.handleLicenseInformation(this.stackLevel);
        this.handleSecurityInformation(this.stackLevel);
    }

    private sortChartColumnData(array: Array<Array<any>>): Array<Array<any>> {
        return array.sort((a, b) => {
            if (a[1] === b[1]) {
                return 0;
            }
            return a[1] > b[1] ? -1 : 1;
        });
    }

    private handleSecurityInformation(tab: UserStackInfoModel): void {
        let dependencies: Array<ComponentInformationModel> = tab.dependencies;
        let security: Array<any> = [];
        let temp: Array<any> = [];
        
        dependencies.forEach((dependency) => {
            security = dependency.security;
            if (security.length > 0) {
                let max: any = security.reduce((a, b) => {
                    return parseFloat(a['CVSS']) < parseFloat(b['CVSS']) ? b : a;
                });
                temp.push({
                    name: dependency.name,
                    cve: max
                });
            }
        });
        if (temp.length > 0) {
            let final: any = temp.reduce((a, b) => {
                return parseFloat(a['cve']['CVSS']) < parseFloat(b['cve']['CVSS']) ? b : a;
            });
            let cvssValue: number = final.cve.CVSS;
            let indicator: number;
            let iconClass: string = 'fa fa-shield';
            let displayClass: string = 'progress-bar-warning';

            if (cvssValue < 0) {
                indicator = -1;
            }
            if (cvssValue >= 7.0) {
                indicator = cvssValue;
                iconClass = 'fa fa-shield';
                displayClass = 'progress-bar-danger';
            }
            this.securityInfo = {
                name: final.name,
                cve: final.cve,
                percentage: final.cve.CVSS * 10,
                status: final.cve.CVSS < 7 ? 'moderate' : 'critical',
                iconClass: iconClass,
                displayClass: displayClass
            };
        }
    }

    private handleLicenseInformation(tab: UserStackInfoModel): void {

        let licenses: any = {};
        let columnData: Array<Array<any>> = [];
        let columnDataLength: number = 0;
        let otherLicensesArray: Array<string> = [];
        let otherLicensesRatio: any = 0;

        let temp: Array<any> = [];
        this.licenseOutliers = 0;
        tab.dependencies.forEach((t) => {
            t.licenses.forEach((license) => {
                if (!licenses[license]) {
                    licenses[license] = 1;
                } else {
                    ++ licenses[license];
                }
            });
            if (t.license_analysis && t.license_analysis.status && t.license_analysis.status.toLowerCase() === 'unknown') {
                ++ this.licenseOutliers;
            }
        });
        for (let i in licenses) {
            if (licenses.hasOwnProperty(i)) {
                // Push names and count to be in this structure ['Name', 20] for C3
                temp = [];
                temp.push(i);
                temp.push(licenses[i]);
                columnData.push(temp);
            }
        }
        // sort the data array by license count
        columnData = this.sortChartColumnData(columnData);
        columnDataLength = columnData ? columnData.length : 0;
        if (columnDataLength > 4) {
            for (let i = 3; i < columnDataLength; i++) {
                otherLicensesArray.push(columnData[i][0]);
                otherLicensesRatio += columnData[i][1];
            }
            columnData.splice(4);
            columnData[3][0] = 'Others';
            columnData[3][1] = otherLicensesRatio;
        }
        this.licenseInfo = {
            data: {
                columns: columnData,
                type: 'donut',
                labels: false
            },
            chartOptions: {
                size: {
                    height: 100,
                    width: 100
                },
                donut: {
                    width: 13,
                    label: {
                        show: false
                    },
                    title: columnDataLength + ' Licenses'
                }
            },
            configs: {
                legend: {
                    show: false
                },
                tooltip: {
                    format: {
                        name: (name, ratio, id, index) => {
                            if (name === 'Others') {
                                return otherLicensesArray.toString();
                            }
                            return name;
                        },
                        value: (value, ratio, id, index) => {
                            return (ratio * 100).toFixed(2) + '%';
                        }
                    }
                }
            }
        };
    }

    private resetFields(): void {
        this.securityInfo = null;
        this.stackLevelOutliers = null;
        this.stackLevel = null;
    }

    private buildReportInShort(): void {
        this.resetFields();
        let resultInformation: Array<ResultInformationModel> = this.result.result;
        if (resultInformation && resultInformation.length > 0) {
            resultInformation.forEach((one: ResultInformationModel, index: number) => {
                this.tabs[index] = {
                    title: one.manifest_file_path,
                    content: one,
                    index: index
                };
            });
            if (this.tabs[0]) this.tabs[0]['active'] = true;
            this.tabSelection(this.tabs[0]);
            this.dataLoaded = true;
            this.error = null;
        }
    }
}
