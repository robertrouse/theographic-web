import React from 'react';
import { Link } from 'gatsby';

import { makeStyles } from '@material-ui/core/styles';
import { FormatQuote, KeyboardArrowRight } from '@material-ui/icons';
import { Grid, List, ListSubheader, ListItem, ListItemIcon, ListItemText, Divider, Button } from '@material-ui/core';

export default function SearchHints ({ searchUpdate }) {
    const classes = useStyles();
    return (
        <>
        <List subheader={<ListSubheader>Try searching for...</ListSubheader>}>
            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon} >
                    {/* <MenuBook />  */}
                    <span role="img" aria-label="book">📖</span>
                </ListItemIcon>
                <ListItemText 
                    primary="Bible references"
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?q=Prov%2025:2'} onClick={() => {searchUpdate('Prov 25:2')}}>Prov&nbsp;25:2</Link>{', '}
                        <Link to={'/?q=Acts%2013'} onClick={() => {searchUpdate('Acts 13')}}>Acts&nbsp;13</Link>{', '}
                        <Link to={'/?q=John%203:16'} onClick={() => {searchUpdate('John 3:16')}}>John&nbsp;3:16</Link>
                    </>}
                />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    <FormatQuote/>
                </ListItemIcon>
                <ListItemText 
                    primary="Words or phrases" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?q=in%20the%20beginning'} onClick={() => {searchUpdate('in the beginning')}}>"in the beginning"</Link>{', '}
                        <Link to={'/?q=search%20the%20scriptures'} onClick={() => {searchUpdate('search the scriptures')}}>"search the scriptures"</Link>
                    </>}
                />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    {/* <PeopleAlt/>  */}
                    <span role="img" aria-label="people">👥</span>
                </ListItemIcon>
                <ListItemText 
                    primary="People" 
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?q=Abraham'} state={{ searchInput: 'Abraham' }} onClick={() => {searchUpdate('Abraham')}}>Abraham</Link>{', '}
                        <Link to={'/?q=Saul'} onClick={() => {searchUpdate('Saul')}}>Saul</Link>{', '}
                        <Link to={'/?q=Zechariah'} onClick={() => {searchUpdate('Zechariah')}}>Zechariah</Link>
                    </>}
                />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem alignItems="flex-start">
                <ListItemIcon className={classes.icon}>
                    {/* <Place/>  */}
                    <span role="img" aria-label="places">📍</span>
                </ListItemIcon>
                <ListItemText 
                    primary="Places"
                    secondary={<>
                        Examples:&nbsp;
                        <Link to={'/?q=Bethlehem'} onClick={() => {searchUpdate('Bethlehem')}}>Bethlehem</Link>,&nbsp;
                        <Link to={'/?q=Antioch'} onClick={() => {searchUpdate('Antioch')}}>Antioch</Link>
                    </>}
                />
            </ListItem>
        </List>
        <Grid container justify = "center" style={{ paddingTop: "30px" }}>
            <Button 
                component={Link} to="/browse" 
                disableRipple 
                color="primary" 
                variant="outlined"
            > Browse the Full Index <KeyboardArrowRight />
            </Button>
        </Grid>
        </>
    );
}

const useStyles = makeStyles(theme => ({
    icon: {
        color:"#000",
        minWidth: 36,
        marginTop: 6,
    }
  }));